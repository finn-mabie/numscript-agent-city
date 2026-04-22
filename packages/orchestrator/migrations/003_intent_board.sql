CREATE TABLE IF NOT EXISTS offers (
  id              TEXT PRIMARY KEY,
  author_agent_id TEXT NOT NULL,
  text            TEXT NOT NULL,
  in_reply_to     TEXT,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  closed_by_tx    TEXT,
  closed_by_agent TEXT,
  closed_at       INTEGER,
  FOREIGN KEY (in_reply_to) REFERENCES offers(id)
);

CREATE INDEX IF NOT EXISTS idx_offers_status_created ON offers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_author         ON offers(author_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_in_reply_to    ON offers(in_reply_to);
