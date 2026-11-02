import { DurableObject } from "cloudflare:workers";
import type { ChatMessage, Decision, Employee, GameState, MessageKind, OpenRisk, Stats } from "../shared/types";
import { AiBudgetError, aiBudgetPercentLeft, hasAiBudget } from "./budget";
import {
  DEPENDENCIES,
  INITIAL_STATS,
  REGRESSION_CHANCE,
  REGRESSION_EFFECTS,
  STACK,
  applyEffects,
  checkGameOver,
  defaultDeps,
  defaultPresence,
  eventPresence,
  formatEffects,
  generateAftermath,
  generateScene,
  matchStack,
  matchStackItems,
  mergePresence,
  regressionPosts,
  secBotDepPosts,
  secBotPosts,
  truncate,
  type DraftMessage,
  type PresenceMap,
  type Scene,
  type SceneEvent,
} from "./game";
import { getRecentNews } from "./news";
import { compareVersions, getAffectingVulns } from "./osv";
import { depPoolKey, getPooledScene, newsPoolKey, pooledKeys } from "./pool";
import {
  QUIET_REPEAT_GAP,
  breachScript,
  fallbackReactions,
  pickQuietScript,
  regressionScript,
  toScene,
  welcomePosts,
  type ScriptedScene,
} from "./scripted";
import { LEGACY_STAFF, NAME_MEMORY, generateStaff } from "./roster";

const BREACH_CHANCE = 0.3;
const BREACH_EFFECTS: Partial<Stats> = { security: -20, reputation: -15, cash: -10, uptime: -15 };
// When both are available, how often a turn features a dependency vuln instead of KEV news.
const DEPENDENCY_EVENT_CHANCE = 0.5;
const MESSAGE_LIMIT = 300;

interface StoredState {
  day: number;
  staff: Employee[];
  stats: Stats;
  presence: PresenceMap;
  // Current version of each npm dependency; patched upgrades move these forward.
  deps: Record<string, string>;
  pendingRegression: { pkg: string; version: string } | null;
  prCounter: number;
  decision: Decision | null;
  openRisks: OpenRisk[];
  seenNews: string[];
  // Reactions written in advance for each option of a scripted decision, keyed by option id.
  scriptedReactions: Record<string, DraftMessage[]> | null;
  recentScripts: string[];
  gameOver: string | null;
}

// A news or dependency event that is only committed once a scene for it is available.
interface EventPlan {
  event: SceneEvent;
  posts: DraftMessage[];
  seenKey: string;
  risk: OpenRisk | null;
  poolKey: string | null;
  isDependency: boolean;
}

type MessageRow = {
  id: number;
  channel: string;
  author: string;
  text: string;
  kind: string;
  link: string | null;
  ts: number;
};

// One Durable Object per player company: holds stats, the pending decision and the chat log.
export class Company extends DurableObject<Env> {
  private busy = false;
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      kind TEXT NOT NULL,
      link TEXT,
      ts INTEGER NOT NULL
    )`);
  }

  async getState(): Promise<GameState> {
    return this.view(await this.load());
  }

  async advance(): Promise<GameState> {
    return this.exclusive(async () => {
      const s = await this.load();
      if (s.gameOver) throw new Error("เกมจบแล้ว กดเริ่มใหม่ได้เลย");
      if (s.decision) throw new Error("ตัดสินใจเรื่องที่ค้างอยู่ก่อนนะ");

      const day = s.day + 1;
      const posts: DraftMessage[] = [];
      let event: SceneEvent = { kind: "quiet" };
      let riskId: string | null = null;
      let scene: Scene | null = null;
      let scripted: ScriptedScene | null = null;
      const aiOk = await hasAiBudget(this.env);
      const live = (input: { event: SceneEvent; openRisks: OpenRisk[] }) =>
        aiOk
          ? liveOrNull(() =>
              generateScene(this.env, { ...input, staff: s.staff, day, stats: s.stats, recent: this.recentChat(14) }),
            )
          : null;

      // An unpatched, actively exploited vulnerability can turn into a breach on any later turn.
      const breach = s.pendingRegression ? null : s.openRisks.find(() => Math.random() < BREACH_CHANCE);
      if (s.pendingRegression) {
        // A rushed upgrade from the previous decision broke something.
        const { pkg, version } = s.pendingRegression;
        s.pendingRegression = null;
        applyEffects(s.stats, REGRESSION_EFFECTS);
        posts.push(...regressionPosts(pkg, version));
        event = { kind: "regression", pkg, version };
        scene = await live({ event, openRisks: s.openRisks });
        if (!scene) scripted = regressionScript(pkg, version);
      } else if (breach) {
        applyEffects(s.stats, BREACH_EFFECTS);
        s.openRisks = s.openRisks.filter((r) => r.newsId !== breach.newsId);
        posts.push({
          channel: "security-alerts",
          author: "system",
          kind: "system",
          text: `🔥 [เหตุการณ์จำลอง] ระบบที่ยังไม่ได้แก้ ${breach.newsId} (${breach.title}) ถูกเจาะแล้ว!\n${formatEffects(BREACH_EFFECTS)}`,
        });
        event = { kind: "breach", risk: breach };
        scene = await live({ event, openRisks: s.openRisks });
        if (!scene) scripted = breachScript(breach);
      } else {
        const plan = await this.planNewsEvent(s, day, aiOk);
        if (plan) {
          // A pooled scene costs no AI; otherwise ask the model while budget remains.
          scene = plan.poolKey ? await getPooledScene(this.env, plan.poolKey, s.staff) : null;
          scene ??= await live({ event: plan.event, openRisks: plan.risk ? [...s.openRisks, plan.risk] : s.openRisks });
          if (scene) {
            // Without a scene the event stays unseen and comes back on a later turn.
            s.seenNews = [plan.seenKey, ...s.seenNews].slice(0, 300);
            if (plan.isDependency) s.prCounter += 1;
            if (plan.risk) {
              s.openRisks.push(plan.risk);
              riskId = plan.risk.newsId;
            }
            posts.push(...plan.posts);
            event = plan.event;
          }
        }
        if (!scene) {
          // Quiet office days are always scripted, as are news turns once the AI budget is spent.
          const quiet = pickQuietScript(s.recentScripts, s.staff);
          s.recentScripts = [quiet.id, ...s.recentScripts].slice(0, QUIET_REPEAT_GAP);
          scripted = quiet;
        }
      }

      s.scriptedReactions = null;
      if (scripted) {
        const built = toScene(scripted, s.staff);
        scene = built.scene;
        s.scriptedReactions = built.reactions;
      }
      // Nothing is persisted until a scene exists, so a failed AI call costs the player nothing.
      if (!scene) throw new Error("พนักงาน AI ตอบไม่ครบ ลองกดใหม่อีกครั้ง");
      posts.push(...scene.messages);

      s.presence = mergePresence(eventPresence(event, s.presence, s.staff), scene.presence);
      s.day = day;
      s.decision = {
        id: crypto.randomUUID(),
        prompt: scene.decision.prompt,
        options: scene.decision.options,
        newsId: riskId,
      };
      s.gameOver = checkGameOver(s.stats);
      this.insert(posts);
      await this.save(s);
      return this.view(s);
    });
  }

  async decide(optionId: string): Promise<GameState> {
    return this.exclusive(async () => {
      const s = await this.load();
      const decision = s.decision;
      if (!decision) throw new Error("ตอนนี้ไม่มีเรื่องให้ตัดสินใจ");
      const chosen = decision.options.find((o) => o.id === optionId);
      if (!chosen) throw new Error("ไม่พบตัวเลือกนี้");

      applyEffects(s.stats, chosen.effects);
      let patchNote = "";
      if (chosen.patches && decision.newsId) {
        const risk = s.openRisks.find((r) => r.newsId === decision.newsId);
        if (risk?.kind === "dependency" && risk.package && risk.fixedVersion) {
          const pkg = risk.package;
          const before = s.deps[pkg];
          if (!before || compareVersions(risk.fixedVersion, before) > 0) s.deps[pkg] = risk.fixedVersion;
          const after = s.deps[pkg];
          // One upgrade can close several advisories for the same package.
          s.openRisks = s.openRisks.filter(
            (r) => !(r.package === pkg && r.fixedVersion && compareVersions(r.fixedVersion, after) <= 0),
          );
          patchNote = `\n✅ merge PR แล้ว: ${pkg} ${before} → ${after}`;
          if (Math.random() < REGRESSION_CHANCE) s.pendingRegression = { pkg, version: after };
        } else {
          s.openRisks = s.openRisks.filter((r) => r.newsId !== decision.newsId);
          patchNote = `\n✅ ปิดความเสี่ยง ${decision.newsId} แล้ว`;
        }
      }

      const posts: DraftMessage[] = [
        { channel: "general", author: "ceo", text: `📢 ตัดสินใจแล้ว: ${chosen.label}` },
        {
          channel: "general",
          author: "system",
          kind: "system",
          text: `ผลกระทบ: ${formatEffects(chosen.effects) || "ไม่มี"}${patchNote}`,
        },
      ];
      const scripted = s.scriptedReactions?.[chosen.id];
      if (scripted) {
        posts.push(...scripted);
      } else {
        try {
          const aftermath = await generateAftermath(this.env, {
            staff: s.staff,
            prompt: decision.prompt,
            chosen,
            others: decision.options.filter((o) => o.id !== chosen.id),
            recent: this.recentChat(10),
          });
          posts.push(...aftermath.messages);
          s.presence = mergePresence(s.presence, aftermath.presence);
        } catch (err) {
          // Reactions are flavour; the decision itself still counts.
          if (!(err instanceof AiBudgetError)) console.error("aftermath failed", err);
          posts.push(...fallbackReactions(chosen, s.staff));
        }
      }

      s.decision = null;
      s.scriptedReactions = null;
      s.gameOver = checkGameOver(s.stats);
      this.insert(posts);
      await this.save(s);
      return this.view(s);
    });
  }

  async reset(): Promise<GameState> {
    return this.exclusive(async () => {
      this.sql.exec("DELETE FROM messages");
      await this.ctx.storage.delete("state");
      return this.view(await this.load());
    });
  }

  // Picks the next unseen news or dependency event without changing state. Without AI budget,
  // only events that already have a pooled scene qualify.
  private async planNewsEvent(s: StoredState, day: number, aiOk: boolean): Promise<EventPlan | null> {
    const fresh = (await getRecentNews(this.env, 40)).filter((n) => !s.seenNews.includes(n.id));
    const vulns = (await getAffectingVulns(this.env, s.deps)).filter((v) => !s.seenNews.includes(`${v.package}:${v.id}`));
    const pooled = await pooledKeys(this.env, [
      ...fresh.map(newsPoolKey),
      ...vulns.map((v) => depPoolKey(v, s.deps[v.package])),
    ]);
    const usableNews = aiOk ? fresh : fresh.filter((n) => pooled.has(newsPoolKey(n)));
    const matchedNews = usableNews.find((n) => matchStack(n).length);
    const depVuln = vulns.find((v) => aiOk || pooled.has(depPoolKey(v, s.deps[v.package])));

    if (depVuln && (!matchedNews || Math.random() < DEPENDENCY_EVENT_CHANCE)) {
      const current = s.deps[depVuln.package];
      const poolKey = depPoolKey(depVuln, current);
      return {
        event: { kind: "dependency", vuln: depVuln, currentVersion: current },
        posts: secBotDepPosts(depVuln, current, s.prCounter + 1),
        seenKey: `${depVuln.package}:${depVuln.id}`,
        risk: {
          newsId: depVuln.id,
          title: `${depVuln.package}@${current}: ${truncate(depVuln.summary, 80)}`,
          since: day,
          kind: "dependency",
          layer: "app",
          component: `npm: ${depVuln.package}`,
          package: depVuln.package,
          fixedVersion: depVuln.fixed,
        },
        poolKey: pooled.has(poolKey) ? poolKey : null,
        isDependency: true,
      };
    }

    const news = matchedNews ?? usableNews[0];
    if (!news) return null;
    const items = matchStackItems(news);
    const matched = items.map((i) => i.name);
    return {
      event: { kind: "news", news, matched },
      posts: secBotPosts(news, matched),
      seenKey: news.id,
      risk: items.length
        ? { newsId: news.id, title: news.name, since: day, kind: "kev", layer: items[0].layer, component: items[0].name }
        : null,
      poolKey: pooled.has(newsPoolKey(news)) ? newsPoolKey(news) : null,
      isDependency: false,
    };
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error("พนักงานกำลังพิมพ์อยู่ รอสักครู่นะ");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  private async load(): Promise<StoredState> {
    const existing = await this.ctx.storage.get<StoredState>("state");
    // Older companies predate the office map, dependency tracking and generated staff; fill in the gaps.
    if (existing) {
      const staff = existing.staff ?? LEGACY_STAFF;
      return {
        ...existing,
        staff,
        presence: existing.presence ?? defaultPresence(staff),
        deps: existing.deps ?? defaultDeps(),
        pendingRegression: existing.pendingRegression ?? null,
        prCounter: existing.prCounter ?? 0,
        scriptedReactions: existing.scriptedReactions ?? null,
        recentScripts: existing.recentScripts ?? [],
        openRisks: existing.openRisks.map((r) => ({ ...r, kind: r.kind ?? "kev", layer: r.layer ?? "edge", component: r.component ?? r.title })),
      };
    }
    // Names used by this player's earlier companies survive resets, so new staff feel new.
    const usedNames = (await this.ctx.storage.get<string[]>("usedNames")) ?? [];
    const staff = generateStaff(usedNames);
    await this.ctx.storage.put("usedNames", [...staff.map((e) => e.name), ...usedNames].slice(0, NAME_MEMORY));
    const fresh: StoredState = {
      day: 0,
      staff,
      stats: { ...INITIAL_STATS },
      presence: defaultPresence(staff),
      deps: defaultDeps(),
      pendingRegression: null,
      prCounter: 0,
      decision: null,
      openRisks: [],
      seenNews: [],
      scriptedReactions: null,
      recentScripts: [],
      gameOver: null,
    };
    this.insert(welcomePosts(staff));
    await this.save(fresh);
    return fresh;
  }

  private async save(s: StoredState): Promise<void> {
    await this.ctx.storage.put("state", s);
  }

  private insert(posts: DraftMessage[]): void {
    const now = Date.now();
    posts.forEach((p, i) => {
      this.sql.exec(
        "INSERT INTO messages (channel, author, text, kind, link, ts) VALUES (?, ?, ?, ?, ?, ?)",
        p.channel,
        p.author,
        p.text,
        p.kind ?? "chat",
        p.link ?? null,
        now + i,
      );
    });
    this.sql.exec("DELETE FROM messages WHERE id <= (SELECT MAX(id) FROM messages) - 1000");
  }

  private recentChat(limit: number): string[] {
    return this.sql
      .exec<MessageRow>("SELECT * FROM messages WHERE kind = 'chat' ORDER BY id DESC LIMIT ?", limit)
      .toArray()
      .reverse()
      .map((m) => `#${m.channel} ${m.author}: ${truncate(m.text, 160)}`);
  }

  private async view(s: StoredState): Promise<GameState> {
    const messages: ChatMessage[] = this.sql
      .exec<MessageRow>("SELECT * FROM messages ORDER BY id DESC LIMIT ?", MESSAGE_LIMIT)
      .toArray()
      .reverse()
      .map((m) => ({ ...m, kind: m.kind as MessageKind }));
    return {
      day: s.day,
      stats: s.stats,
      // Personality, secret goal and speech stay server-side.
      employees: s.staff.map(({ id, name, role, emoji, avatar }) => ({ id, name, role, emoji, avatar })),
      presence: s.presence,
      stack: STACK.map(({ name, layer }) => ({ name, layer })),
      deps: DEPENDENCIES.map((d) => ({ name: d.name, version: s.deps[d.name] ?? d.version })),
      messages,
      decision: s.decision,
      openRisks: s.openRisks,
      aiPercentLeft: await aiBudgetPercentLeft(this.env),
      gameOver: s.gameOver,
    };
  }
}

// Runs a live AI call, or returns null when the shared daily budget is spent.
async function liveOrNull(fn: () => Promise<Scene>): Promise<Scene | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AiBudgetError) return null;
    throw err;
  }
}
