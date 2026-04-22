CREATE TABLE IF NOT EXISTS assets (
  code         TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  emoji        TEXT,
  hex          TEXT NOT NULL,
  decimals     INTEGER NOT NULL,
  unit_label   TEXT NOT NULL,
  is_currency  INTEGER NOT NULL DEFAULT 0,
  total_supply INTEGER
);

INSERT OR IGNORE INTO assets (code, label, emoji, hex, decimals, unit_label, is_currency, total_supply) VALUES
  ('USD/2',          'US Dollar',     '🇺🇸', '#BAEABC', 2, '$',  1, NULL),
  ('EUR/2',          'Euro',          '🇪🇺', '#8CB8D6', 2, '€',  1, NULL),
  ('STRAWBERRY/0',   'Strawberry',    '🍓', '#F5B8C8', 0, '🍓', 0, 200),
  ('COMPUTEHOUR/0',  'Compute Hour',  '💻', '#60D6CE', 0, '💻', 0, 50);
