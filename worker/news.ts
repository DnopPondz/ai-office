import type { NewsItem } from "../shared/types";

// CISA KEV entries pulled through the NVD API. NVD lets us filter by KEV date,
// which keeps each response small (the full KEV feed is ~1.8 MB, too much to parse
// within the free plan's 10 ms CPU budget).
const NVD_API = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface NvdCvssData {
  baseScore?: number;
  baseSeverity?: string;
}

export interface NvdCve {
  id: string;
  cisaExploitAdd?: string;
  cisaActionDue?: string;
  cisaRequiredAction?: string;
  cisaVulnerabilityName?: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: Record<string, { cvssData?: NvdCvssData }[] | undefined>;
  configurations?: { nodes?: { cpeMatch?: { criteria?: string }[] }[] }[];
}

interface NvdResponse {
  vulnerabilities?: { cve: NvdCve }[];
}

type NewsRow = {
  id: string;
  name: string;
  description: string;
  kev_added: string;
  due_date: string | null;
  required_action: string | null;
  cvss: number | null;
  severity: string | null;
  products: string;
  url: string;
};

function pickCvss(metrics: NvdCve["metrics"]): NvdCvssData | null {
  for (const key of ["cvssMetricV40", "cvssMetricV31", "cvssMetricV30"]) {
    const data = metrics?.[key]?.[0]?.cvssData;
    if (data) return data;
  }
  return null;
}

// "cpe:2.3:a:vercel:next.js:*:..." -> "vercel:next.js"
function pickProducts(cve: NvdCve): string[] {
  const products = new Set<string>();
  for (const config of cve.configurations ?? []) {
    for (const node of config.nodes ?? []) {
      for (const match of node.cpeMatch ?? []) {
        const parts = match.criteria?.split(":");
        // CPE escapes punctuation with backslashes, e.g. "pn\/dp".
        if (parts && parts.length > 4) products.add(`${parts[3]}:${parts[4]}`.replace(/\\(.)/g, "$1"));
      }
    }
  }
  return [...products].slice(0, 10);
}

export function toNewsItem(cve: NvdCve): NewsItem {
  const cvss = pickCvss(cve.metrics);
  return {
    id: cve.id,
    name: cve.cisaVulnerabilityName ?? cve.id,
    description: cve.descriptions?.find((d) => d.lang === "en")?.value ?? "",
    kevAdded: cve.cisaExploitAdd ?? "",
    dueDate: cve.cisaActionDue ?? null,
    requiredAction: cve.cisaRequiredAction ?? null,
    cvss: cvss?.baseScore ?? null,
    severity: cvss?.baseSeverity ?? null,
    products: pickProducts(cve),
    url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
  };
}

function fromRow(row: NewsRow): NewsItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kevAdded: row.kev_added,
    dueDate: row.due_date,
    requiredAction: row.required_action,
    cvss: row.cvss,
    severity: row.severity,
    products: JSON.parse(row.products) as string[],
    url: row.url,
  };
}

export async function refreshNews(env: Env, days: number): Promise<number> {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);
  const url = `${NVD_API}?hasKev&kevStartDate=${start.toISOString()}&kevEndDate=${end.toISOString()}`;

  const res = await fetch(url, { headers: { "User-Agent": "wedeb-ai-office/0.1" } });
  if (!res.ok) throw new Error(`NVD responded ${res.status}`);
  const data = await res.json<NvdResponse>();
  const items = (data.vulnerabilities ?? []).map((v) => toNewsItem(v.cve)).filter((n) => n.kevAdded);

  const now = Date.now();
  const statements = items.map((n) =>
    env.DB.prepare(
      `INSERT INTO news (id, name, description, kev_added, due_date, required_action, cvss, severity, products, url, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description, kev_added = excluded.kev_added,
         due_date = excluded.due_date, required_action = excluded.required_action, cvss = excluded.cvss,
         severity = excluded.severity, products = excluded.products, fetched_at = excluded.fetched_at`,
    ).bind(
      n.id, n.name, n.description, n.kevAdded, n.dueDate, n.requiredAction,
      n.cvss, n.severity, JSON.stringify(n.products), n.url, now,
    ),
  );
  statements.push(
    env.DB.prepare(
      `INSERT INTO meta (key, value) VALUES ('news_fetched_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(String(now)),
  );
  await env.DB.batch(statements);
  return items.length;
}

// Called before a game turn so a fresh install has news without waiting for the cron.
export async function ensureFreshNews(env: Env): Promise<void> {
  try {
    const row = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'news_fetched_at'`).first<{ value: string }>();
    if (!row) {
      await refreshNews(env, 14);
    } else if (Date.now() - Number(row.value) > STALE_AFTER_MS) {
      await refreshNews(env, 3);
    }
  } catch (err) {
    // The game still works on cached news (or a quiet office day) if NVD is down.
    console.error("news refresh failed", err);
  }
}

export async function getRecentNews(env: Env, limit: number): Promise<NewsItem[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM news ORDER BY kev_added DESC, id DESC LIMIT ?`)
    .bind(limit)
    .all<NewsRow>();
  return results.map(fromRow);
}
