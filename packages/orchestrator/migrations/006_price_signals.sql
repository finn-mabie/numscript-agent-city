CREATE TABLE IF NOT EXISTS price_signals (
  id              TEXT PRIMARY KEY,
  asset_code      TEXT NOT NULL,
  target_price    INTEGER NOT NULL,
  set_by_ip_hash  TEXT NOT NULL,
  set_at          INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  note            TEXT,
  FOREIGN KEY (asset_code) REFERENCES assets(code)
);

CREATE INDEX IF NOT EXISTS idx_price_signals_active ON price_signals(asset_code, expires_at DESC);
