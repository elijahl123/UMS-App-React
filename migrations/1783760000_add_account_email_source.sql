ALTER TABLE account_email_addresses
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'email';

UPDATE account_email_addresses
SET source = 'email'
WHERE source IS NULL OR source = '';

