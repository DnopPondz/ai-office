import type { DepVuln } from "../shared/types";
import { DEPENDENCIES } from "./game";

// Real vulnerability data for the fictional company's pinned npm dependencies, from OSV.dev.
const OSV_API = "https://api.osv.dev/v1";
const LIST_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
// The free plan allows 50 external subrequests per invocation; details are filled in batches.
const DETAILS_PER_RUN = 20;

interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
}

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  published?: string;
  database_specific?: { severity?: string };
  affected?: {
    package?: { name?: string; ecosystem?: string };
    ranges?: { type?: string; events?: OsvEvent[] }[];
  }[];
}

type DepVulnRow = {
  id: string;
  package: string;
  summary: string | null;
  aliases: string;
  severity: string | null;
  introduced: string | null;
  fixed: string | null;
  published: string | null;
  url: string;
};

// Numeric x.y.z comparison; prerelease and build tags are ignored.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.+-]/)
      .slice(0, 3)
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// The range that contains our pinned version, so "fixed" is the upgrade that actually helps us.
function pickRange(vuln: OsvVuln, pkg: string, version: string): { introduced: string | null; fixed: string | null } {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== pkg || affected.package?.ecosystem !== "npm") continue;
    for (const range of affected.ranges ?? []) {
      if (range.type !== "SEMVER" && range.type !== "ECOSYSTEM") continue;
      let introduced = "0";
      for (const event of range.events ?? []) {
        if (event.introduced !== undefined) introduced = event.introduced;
        const from = introduced === "0" ? "0.0.0" : introduced;
        if (event.fixed && compareVersions(version, from) >= 0 && compareVersions(version, event.fixed) < 0) {
          return { introduced, fixed: event.fixed };
        }
        if (event.last_affected && compareVersions(version, from) >= 0 && compareVersions(version, event.last_affected) <= 0) {
          return { introduced, fixed: null };
        }
      }
    }
  }
  return { introduced: null, fixed: null };
}

export async function refreshDeps(env: Env): Promise<void> {
  const now = Date.now();
  const listed = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'deps_listed_at'`).first<{ value: string }>();

  if (!listed || now - Number(listed.value) > LIST_STALE_AFTER_MS) {
    const res = await fetch(`${OSV_API}/querybatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: DEPENDENCIES.map((d) => ({ package: { name: d.name, ecosystem: "npm" }, version: d.version })),
      }),
    });
    if (!res.ok) throw new Error(`OSV querybatch responded ${res.status}`);
    const data = await res.json<{ results?: { vulns?: { id: string }[] }[] }>();
    const statements: D1PreparedStatement[] = [];
    (data.results ?? []).forEach((result, i) => {
      const pkg = DEPENDENCIES[i]?.name;
      if (!pkg) return;
      for (const v of result.vulns ?? []) {
        statements.push(
          env.DB.prepare(`INSERT OR IGNORE INTO dep_vulns (id, package, url, fetched_at) VALUES (?, ?, ?, ?)`).bind(
            v.id,
            pkg,
            `https://osv.dev/vulnerability/${v.id}`,
            now,
          ),
        );
      }
    });
    statements.push(
      env.DB.prepare(
        `INSERT INTO meta (key, value) VALUES ('deps_listed_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).bind(String(now)),
    );
    await env.DB.batch(statements);
  }

  const { results: pending } = await env.DB.prepare(`SELECT id, package FROM dep_vulns WHERE detailed = 0 LIMIT ?`)
    .bind(DETAILS_PER_RUN)
    .all<{ id: string; package: string }>();
  if (!pending.length) return;

  const details = await Promise.all(
    pending.map(async (p) => {
      const res = await fetch(`${OSV_API}/vulns/${encodeURIComponent(p.id)}`);
      return res.ok ? { p, v: await res.json<OsvVuln>() } : null;
    }),
  );
  const statements = details.flatMap((d) => {
    if (!d) return [];
    const pinned = DEPENDENCIES.find((x) => x.name === d.p.package)?.version ?? "0.0.0";
    const range = pickRange(d.v, d.p.package, pinned);
    const summary = d.v.summary ?? d.v.details?.slice(0, 200) ?? d.v.id;
    return [
      env.DB.prepare(
        `UPDATE dep_vulns SET summary = ?, aliases = ?, severity = ?, introduced = ?, fixed = ?, published = ?,
                detailed = 1, fetched_at = ?
         WHERE id = ? AND package = ?`,
      ).bind(
        summary,
        JSON.stringify(d.v.aliases ?? []),
        d.v.database_specific?.severity ?? null,
        range.introduced,
        range.fixed,
        d.v.published ?? null,
        now,
        d.p.id,
        d.p.package,
      ),
    ];
  });
  if (statements.length) await env.DB.batch(statements);
}

// Vulnerabilities that still affect a company at its current dependency versions, newest first.
export async function getAffectingVulns(env: Env, versions: Record<string, string>): Promise<DepVuln[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM dep_vulns WHERE detailed = 1 AND fixed IS NOT NULL ORDER BY published DESC LIMIT 300`,
  ).all<DepVulnRow>();
  return results
    .filter((r) => {
      const current = versions[r.package];
      if (!current || !r.fixed) return false;
      const from = !r.introduced || r.introduced === "0" ? "0.0.0" : r.introduced;
      return compareVersions(current, from) >= 0 && compareVersions(current, r.fixed) < 0;
    })
    .map((r) => ({
      id: r.id,
      package: r.package,
      summary: r.summary ?? r.id,
      aliases: JSON.parse(r.aliases) as string[],
      severity: r.severity,
      introduced: r.introduced,
      fixed: r.fixed,
      published: r.published,
      url: r.url,
    }));
}
