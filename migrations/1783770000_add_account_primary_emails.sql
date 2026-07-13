CREATE TABLE IF NOT EXISTS account_primary_emails (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_primary_emails_email_key
  ON account_primary_emails (lower(email));

INSERT INTO account_primary_emails (firebase_uid, email)
SELECT firebase_uid, 'elijah.kane.1972@gmail.com'
FROM account_email_addresses
WHERE lower(email) = 'elijahkanelopez@gmail.com'
ON CONFLICT (firebase_uid) DO NOTHING;
