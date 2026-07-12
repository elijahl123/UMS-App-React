CREATE TABLE IF NOT EXISTS
  account_email_addresses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    firebase_uid TEXT NOT NULL,
    email TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    verification_token TEXT UNIQUE,
    verification_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    UNIQUE (firebase_uid, email)
  );

CREATE INDEX IF NOT EXISTS idx_account_email_addresses_firebase_uid
  ON account_email_addresses (firebase_uid);

CREATE INDEX IF NOT EXISTS idx_account_email_addresses_verification_token
  ON account_email_addresses (verification_token);
