CREATE TABLE IF NOT EXISTS dms (
  id              TEXT PRIMARY KEY,
  from_agent_id   TEXT NOT NULL,
  to_agent_id     TEXT NOT NULL,
  text            TEXT NOT NULL,
  in_reply_to     TEXT,
  in_reply_kind   TEXT,            -- 'dm' | 'offer' | null
  created_at      INTEGER NOT NULL,
  read_at         INTEGER,
  expires_at      INTEGER NOT NULL,
  FOREIGN KEY (from_agent_id) REFERENCES agents(id),
  FOREIGN KEY (to_agent_id)   REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_dms_inbox  ON dms(to_agent_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dms_outbox ON dms(from_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dms_thread ON dms(in_reply_to);
