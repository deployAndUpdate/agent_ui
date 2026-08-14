-- Visual Agent Engine — TUI track only
CREATE TABLE IF NOT EXISTS tui_sessions (
  session_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  last_manifest JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tui_outbox (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tui_outbox_pending ON tui_outbox (status, id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS tui_actions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tui_idempotency_keys (
  session_id TEXT NOT NULL,
  key TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, key)
);
