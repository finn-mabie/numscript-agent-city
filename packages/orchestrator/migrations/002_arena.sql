CREATE TABLE IF NOT EXISTS arena_attacks (
  attack_id       TEXT PRIMARY KEY,
  target_agent_id TEXT NOT NULL,
  prompt_hash     TEXT NOT NULL,
  prompt_preview  TEXT NOT NULL,        -- first 140 chars, for HUD/panel display
  ip_hash         TEXT NOT NULL,        -- sha256(ip + per-process salt)
  submitted_at    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',   -- queued | running | committed | rejected | expired
  tick_id         TEXT,
  outcome_phase   TEXT,                 -- authorization | validate | render | dry-run | commit | scheduler
  outcome_code    TEXT,
  resolved_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_arena_attacks_submitted_at ON arena_attacks(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_attacks_target ON arena_attacks(target_agent_id, submitted_at DESC);
