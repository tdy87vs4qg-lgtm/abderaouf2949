-- ============================================================================
-- تيسير — Open signup + admin approval (auth change)
--
-- The account model changes from "admin-provisioned only" to "open self-signup,
-- locked until an admin approves". Every account can now be created by the user
-- themselves (email + password); the account is created immediately and stays
-- permanently. But it starts LOCKED: the user can sign in and browse everything,
-- yet every FILE stays locked until an admin flips `approved` to 1.
--
--   approved = 0  → locked. Can log in + browse, but files open the contact popup.
--   approved = 1  → full access; every file opens normally.
--
-- Admins are implicitly approved (their role bypasses the gate), but we still
-- default existing admin rows to approved = 1 for clarity. Existing subscriber
-- rows created before this migration are grandfathered as approved so nobody
-- who already had access loses it.
-- ============================================================================

-- Add the approval flag. New accounts default to 0 (locked) — see createAccount
-- / signup which insert an explicit value. SQLite requires a constant default.
ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;

-- Grandfather everyone who already existed before this migration:
--   • admins are always fully entitled;
--   • pre-existing subscribers keep the access they already had.
-- Brand-new signups (inserted AFTER this runs) come in with approved = 0.
UPDATE users SET approved = 1;

CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved);
