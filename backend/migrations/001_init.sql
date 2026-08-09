-- Visual Agent Engine schema
CREATE TABLE IF NOT EXISTS dashboards (
  session_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 1),
  manifest JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  manifest JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events (status, id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS idempotency_keys (
  session_id TEXT NOT NULL,
  key TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, key)
);

CREATE TABLE IF NOT EXISTS widget_interactions (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
