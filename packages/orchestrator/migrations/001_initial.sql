CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  tagline         TEXT NOT NULL,
  color           TEXT NOT NULL,
  next_tick_at    INTEGER NOT NULL,
  hustle_mode     INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_next_tick_at ON agents(next_tick_at);

CREATE TABLE IF NOT EXISTS relationships (
  agent_id            TEXT NOT NULL,
  peer_id             TEXT NOT NULL,
  trust               REAL NOT NULL DEFAULT 0,
  last_interaction_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, peer_id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_trust ON relationships(agent_id, trust);

CREATE TABLE IF NOT EXISTS intent_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT NOT NULL,
  tick_id         TEXT NOT NULL UNIQUE,
  reasoning       TEXT NOT NULL,
  template_id     TEXT,
  params          TEXT,        -- JSON-encoded
  outcome         TEXT NOT NULL,
  error_phase     TEXT,
  error_code      TEXT,
  tx_id           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intent_log_agent ON intent_log(agent_id, created_at DESC);
