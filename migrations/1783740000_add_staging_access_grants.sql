CREATE TABLE IF NOT EXISTS staging_access_grants (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  firebase_uid TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS staging_access_grants_firebase_uid_key
  ON staging_access_grants (firebase_uid)
  WHERE firebase_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS staging_access_grants_status_idx
  ON staging_access_grants (status);
