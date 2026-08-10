-- ============================================================================
-- تيسير — Clear ALL existing accounts (DESTRUCTIVE — manual use only)
--
-- Deletes every session, every device request and every user row, so the app is
-- left with ZERO accounts and everyone signs up fresh.
--
-- ⚠️  NOT AUTO-RUN. Nothing in the build, dev server or deploy pipeline executes
--     this file. You must run it yourself, deliberately, with the commands below.
--
-- ⚠️  IRREVERSIBLE. There is no undo. All users (INCLUDING the admin account) are
--     removed. The admin is re-created automatically on the next request from
--     ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD (seedAdminFromEnv), so make sure
--     those env vars are set before you run this in production.
--
-- HOW TO RUN
--   LOCAL:      npx wrangler d1 execute bacyeswecan-production --local --file=./scripts/clear-accounts.sql
--   PRODUCTION: npx wrangler d1 execute bacyeswecan-production --remote --file=./scripts/clear-accounts.sql
--
-- ORDERING NOTE
--   Run this BEFORE migrations/0004_remove_device_lock.sql if you want the
--   `DELETE FROM device_requests;` line to succeed — 0004 drops that table, after
--   which this statement errors with "no such table: device_requests". In that
--   case just delete/comment that one line; the users + sessions deletes are the
--   ones that matter.
--
-- NOT TOUCHED: KV (sessions are also keyed in KV but expire on their own),
-- SESSION_SECRET, Drive/Service-Account config, or any other table.
-- ============================================================================

DELETE FROM sessions;
DELETE FROM device_requests;
DELETE FROM users;
