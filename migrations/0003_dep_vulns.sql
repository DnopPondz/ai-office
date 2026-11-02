-- Vulnerabilities in the fictional company's npm dependencies, from OSV.dev.
-- Rows start with only id/package (from querybatch); details are filled in later batches.
CREATE TABLE IF NOT EXISTS dep_vulns (
  id TEXT NOT NULL,
  package TEXT NOT NULL,
  summary TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  severity TEXT,
  introduced TEXT,
  fixed TEXT,
  published TEXT,
  url TEXT NOT NULL,
  detailed INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (id, package)
);

CREATE INDEX IF NOT EXISTS idx_dep_vulns_detailed ON dep_vulns (detailed, published DESC);
