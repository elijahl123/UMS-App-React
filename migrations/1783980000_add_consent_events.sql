CREATE TABLE IF NOT EXISTS consent_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS consent_events_email_idx ON consent_events (lower(email));
CREATE INDEX IF NOT EXISTS consent_events_user_id_idx ON consent_events (user_id);
CREATE INDEX IF NOT EXISTS consent_events_occurred_at_idx ON consent_events (occurred_at);

-- Consent evidence must be append-only: once a consent (or its withdrawal) is
-- logged, the row itself is the proof and must never be edited in place.
-- DELETE stays allowed for the long-term retention purge in server/retention.ts.
CREATE OR REPLACE FUNCTION consent_events_prevent_update() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'consent_events rows are immutable once written; insert a new row instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consent_events_no_update ON consent_events;
CREATE TRIGGER consent_events_no_update
  BEFORE UPDATE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION consent_events_prevent_update();
