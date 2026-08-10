-- ============================================================================
-- تيسير — 0005: Google OAuth login (PART B-2)
--
-- Adds the ONE column "Sign in with Google" needs on `users`:
--
--     google_id  TEXT NULL   → Google's stable `sub` claim for this account.
--                              NULL for every password-only account.
--
-- `email` already exists (migrations/0001_auth.sql created `email` +
-- `email_lower UNIQUE`), so nothing has to be added for it — the statements
-- below only RE-ASSERT the email index so a database that somehow lost it is
-- repaired. No existing column, row, index or constraint is modified.
--
-- ⚠️  NOT AUTO-RUN. Apply it manually, exactly like 0004:
--   LOCAL:      npx wrangler d1 migrations apply bacyeswecan-production --local
--   PRODUCTION: npx wrangler d1 migrations apply bacyeswecan-production --remote
--
-- Safe to skip in an emergency: src/lib/google-users.ts →
-- ensureGoogleAuthSchema() applies the same ALTER/INDEX defensively at runtime
-- (the identical self-healing pattern users.ts already uses for `approved`), so
-- a not-yet-migrated deployment self-repairs instead of erroring. Running this
-- migration is still the correct, explicit way to get there.
--
-- UNTOUCHED BY THIS MIGRATION: `sessions` (the session mechanism, its cookie
-- and its KV mirror), the `approved` subscription/approval gate, Drive, and
-- every other table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The Google account id (`sub`).
--
--    Nullable with NO default: password-only accounts keep NULL, and existing
--    rows are therefore completely unaffected. SQLite has no
--    "ADD COLUMN IF NOT EXISTS": if this line errors with
--    "duplicate column name: google_id" the column is already present (the
--    runtime guard added it) — comment this single statement out and re-run.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN google_id TEXT;

-- ---------------------------------------------------------------------------
-- 2. One Google account may own at most ONE row.
--
--    PARTIAL unique index (… WHERE google_id IS NOT NULL) so that the many
--    password-only rows holding NULL never collide with each other — in SQLite
--    a plain UNIQUE index would already allow repeated NULLs, but stating the
--    predicate keeps the intent explicit and the index small.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id) WHERE google_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Email lookup index — RE-ASSERTED, not created anew.
--
--    `email` / `email_lower UNIQUE` come from 0001_auth.sql; the Google login
--    path looks accounts up by `email_lower` when no google_id matches yet (so
--    an existing password account is LINKED instead of duplicated). IF NOT
--    EXISTS makes this a no-op on any correctly-migrated database.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(email_lower);
