-- ============================================================================
-- تيسير — Auth foundation schema (Task 4A)
--
-- D1 is the source of truth for accounts and sessions. Sessions are ALSO
-- mirrored into KV for O(1) reads on the hot path (every gated request), but
-- D1 remains authoritative so the admin dashboard (Task 4B) can list/revoke
-- sessions and reset a subscriber's device without depending on KV.
--
-- There is NO public self-signup: rows in `users` are created only by the
-- admin (a later task). This migration just defines the data model.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users — one row per account (admin-provisioned only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,              -- opaque uuid (never sequential)
  email          TEXT NOT NULL,                 -- login identifier
  email_lower    TEXT NOT NULL UNIQUE,          -- normalised for case-insensitive lookup
  password_hash  TEXT NOT NULL,                 -- PBKDF2 encoded string (algo$iter$salt$hash)
  role           TEXT NOT NULL DEFAULT 'subscriber'  -- 'subscriber' | 'admin'
                   CHECK (role IN ('subscriber', 'admin')),
  status         TEXT NOT NULL DEFAULT 'active'      -- 'active' | 'suspended'
                   CHECK (status IN ('active', 'suspended')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(email_lower);

-- ---------------------------------------------------------------------------
-- sessions — one row per active login (persistent, ~1 year)
--
-- Single-device enforcement (Task 4B) is layered on top of this table; the
-- schema already carries the columns it needs (user_id + created_at) so no
-- future migration is required to add device binding metadata here — device
-- info is tracked in a dedicated column added in 4B, keeping 4A minimal.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,                 -- SHA-256 of the raw cookie token (raw token never stored)
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,                    -- ISO8601 UTC; sliding, silently renewed
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
