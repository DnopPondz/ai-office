-- Estimated Workers AI neurons spent per UTC day, shared by every company on the account.
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  neurons REAL NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0
);

-- Scenes generated ahead of time from leftover daily quota, shared by every company.
-- key: "news:<cve>" or "dep:<package>@<version>:<advisory>"; scene: sanitized Scene JSON.
CREATE TABLE IF NOT EXISTS scene_pool (
  key TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
