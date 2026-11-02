import type { DepVuln, Employee, NewsItem } from "../shared/types";
import { AiBudgetError, DAILY_NEURON_BUDGET, hasAiBudget } from "./budget";
import { companyDeps, getBusiness, type Business } from "./business";
import { generateScene, matchStack, parseScene, type DraftMessage, type PresenceMap, type Scene, type SceneEvent } from "./game";
import { getRecentNews } from "./news";
import { getAffectingVulns } from "./osv";
import { holder, isRoleKey, renderText, roleCast } from "./roster";

// Scenes for news and dependency events are generated ahead of time by cron, from quota that
// would otherwise be lost at the 00:00 UTC reset. Turns that find a pooled scene cost no AI.
// A scene depends on the business (its stack decides whether news hits it), so the pool is
// filled only for business types someone has played recently.
const POOL_PER_RUN = 6;
// Before LATE_HOUR_UTC the pool stops at this much daily usage, leaving the rest for live play.
const POOL_DAYTIME_CEILING = 5000;
// 20:00 UTC is 03:00 in Thailand; from then until the reset, the pool may use the whole budget.
const LATE_HOUR_UTC = 20;
const POOL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_FOR_MS = 3 * 24 * 60 * 60 * 1000;
// Bumped when the stored scene format changes; older rows are ignored and pruned.
const POOL_VERSION = "v3";

export function newsPoolKey(business: string, news: NewsItem): string {
  return `${POOL_VERSION}:${business}:news:${news.id}`;
}

// A dependency scene names the pinned version, so it only fits a company still on that version.
export function depPoolKey(business: string, vuln: DepVuln, version: string): string {
  return `${POOL_VERSION}:${business}:dep:${vuln.package}@${version}:${vuln.id}`;
}

// Called on every turn so the cron knows which business types are worth preparing scenes for.
export async function markBusinessActive(env: Env, business: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(`biz_active:${business}`, String(Date.now()))
    .run();
}

async function activeBusinesses(env: Env): Promise<Business[]> {
  const { results } = await env.DB.prepare(`SELECT key, value FROM meta WHERE key LIKE 'biz_active:%'`).all<{
    key: string;
    value: string;
  }>();
  const since = Date.now() - ACTIVE_FOR_MS;
  return results.filter((r) => Number(r.value) > since).map((r) => getBusiness(r.key.slice("biz_active:".length)));
}

export async function pooledKeys(env: Env, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  // D1 allows at most 100 bound parameters per query.
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT key FROM scene_pool WHERE key IN (${chunk.map(() => "?").join(", ")})`,
    )
      .bind(...chunk)
      .all<{ key: string }>();
    for (const r of results) found.add(r.key);
  }
  return found;
}

// Role ids are the same for every business, so any role cast can re-check a stored scene.
const PARSE_CAST = roleCast(getBusiness("saas"));

// Pooled scenes are kept after use: other companies, and this one after a reset, can still play them.
export async function getPooledScene(env: Env, key: string, staff: Employee[]): Promise<Scene | null> {
  const row = await env.DB.prepare(`SELECT scene FROM scene_pool WHERE key = ?`).bind(key).first<{ scene: string }>();
  if (!row) return null;
  let scene: Scene | null;
  try {
    scene = parseScene(JSON.parse(row.scene), PARSE_CAST);
  } catch {
    return null;
  }
  return scene && castPooledScene(scene, staff);
}

// Pooled scenes are written with role keys as authors and {role} placeholders as names.
function castPooledScene(scene: Scene, staff: Employee[]): Scene | null {
  const byRole = (role: string) => (isRoleKey(role) ? holder(staff, role) : undefined);
  const messages: DraftMessage[] = [];
  for (const m of scene.messages) {
    const speaker = byRole(m.author);
    const text = speaker ? renderText(m.text, staff, speaker) : null;
    if (!speaker || text === null) continue;
    const channel = m.channel.startsWith("dm-") ? `dm-${speaker.id}` : m.channel;
    messages.push({ ...m, author: speaker.id, channel, text });
  }
  if (!messages.length) return null;
  const presence: Partial<PresenceMap> = {};
  for (const [role, p] of Object.entries(scene.presence)) {
    const person = byRole(role);
    if (person && p) presence[person.id] = { ...p, activity: renderText(p.activity, staff) ?? p.activity };
  }
  const { prompt, options } = scene.decision;
  return {
    messages,
    presence,
    decision: {
      prompt: renderText(prompt, staff) ?? prompt,
      options: options.map((o) => ({ ...o, label: renderText(o.label, staff) ?? o.label })),
    },
  };
}

export async function fillScenePool(env: Env): Promise<number> {
  const cutoff = Date.now() - POOL_MAX_AGE_MS;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM scene_pool WHERE created_at < ? OR key NOT LIKE ?`).bind(cutoff, `${POOL_VERSION}:%`),
    env.DB.prepare(`DELETE FROM ai_usage WHERE day < ?`).bind(new Date(cutoff).toISOString().slice(0, 10)),
  ]);

  const businesses = await activeBusinesses(env);
  if (!businesses.length) return 0;
  const ceiling = new Date().getUTCHours() >= LATE_HOUR_UTC ? DAILY_NEURON_BUDGET : POOL_DAYTIME_CEILING;
  const news = await getRecentNews(env, 40);

  // Interleave businesses so one busy type does not starve the others.
  const perBusiness = await Promise.all(
    businesses.map(async (b) => {
      const deps = companyDeps(b);
      return [
        ...news.map((n) => ({
          b,
          key: newsPoolKey(b.id, n),
          event: { kind: "news", news: n, matched: matchStack(n, b.stack) } as SceneEvent,
        })),
        ...(await getAffectingVulns(env, deps)).map((vuln) => ({
          b,
          key: depPoolKey(b.id, vuln, deps[vuln.package]),
          event: { kind: "dependency", vuln, currentVersion: deps[vuln.package] } as SceneEvent,
        })),
      ];
    }),
  );
  const candidates = perBusiness.flatMap((list, i) => list.map((c, j) => ({ ...c, order: j * businesses.length + i })));
  candidates.sort((x, y) => x.order - y.order);
  const existing = await pooledKeys(env, candidates.map((c) => c.key));

  let added = 0;
  for (const c of candidates.filter((c) => !existing.has(c.key)).slice(0, POOL_PER_RUN)) {
    if (!(await hasAiBudget(env, ceiling))) break;
    try {
      const scene = await generateScene(env, { event: c.event, staff: roleCast(c.b), business: c.b });
      await env.DB.prepare(`INSERT OR IGNORE INTO scene_pool (key, scene, created_at) VALUES (?, ?, ?)`)
        .bind(c.key, JSON.stringify(scene), Date.now())
        .run();
      added += 1;
    } catch (err) {
      if (err instanceof AiBudgetError) break;
      // A malformed answer only skips this candidate; the next run tries it again.
      console.error(`pool scene failed for ${c.key}`, err);
    }
  }
  return added;
}
