-- Real-world vulnerability news (CISA KEV entries pulled from the NVD API).
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kev_added TEXT NOT NULL,
  due_date TEXT,
  required_action TEXT,
  cvss REAL,
  severity TEXT,
  products TEXT NOT NULL DEFAULT '[]',
  url TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_kev_added ON news (kev_added DESC);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
