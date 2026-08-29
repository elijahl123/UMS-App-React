-- Makes queued offline mutations safe to replay.
--
-- A queued write is only removed from the client once its response arrives, so a
-- response lost in transit leaves the record in place and the next sync sends it
-- again. Without a receipt the server has no way to tell that retry apart from a
-- genuine second write, and the user silently ends up with duplicated rows.

CREATE TABLE IF NOT EXISTS mutation_receipts (
  user_id TEXT NOT NULL,
  client_mutation_id UUID NOT NULL,
  action TEXT NOT NULL,
  result JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_mutation_id)
);

-- Receipts only need to outlive a client's retry window; this supports pruning.
CREATE INDEX IF NOT EXISTS mutation_receipts_created_at_idx ON mutation_receipts (created_at);
