-- ============================================================================
-- تيسير — 0004: Remove the single-device lock (STEP 1)
--
-- The "one account = one device" rule is GONE. It is disabled in the
-- TypeScript first (src/lib/devices.ts::checkAndBindDevice now always returns
-- { ok: true }, and ensureDeviceSchema() is an inert no-op), because the old
-- code was SELF-HEALING: it re-created `device_requests` and re-added
-- `users.device_fingerprint` on every login, so a migration alone could NOT
-- have removed the lock. This migration is the DB-side cleanup only.
--
-- NOT AUTO-RUN. Apply manually when you want the leftover schema gone:
--   LOCAL:      npx wrangler d1 migrations apply bacyeswecan-production --local
--   PRODUCTION: npx wrangler d1 migrations apply bacyeswecan-production --remote
--
-- Safe to apply and safe to skip: the application no longer reads or writes any
-- of these objects. Sessions, users, subscription/approval gate, KV and the
-- session cookie mechanism are all untouched by this migration.
-- ============================================================================

-- 1. Drop the device-switch approval indexes (no-ops if already absent).
DROP INDEX IF EXISTS idx_device_requests_open;
DROP INDEX IF EXISTS idx_device_requests_user_id;
DROP INDEX IF EXISTS idx_device_requests_status;

-- 2. Drop the pending-device-request table. Nothing writes to it anymore.
DROP TABLE IF EXISTS device_requests;

-- 3. users.device_fingerprint is now DEAD DATA — never read, never written.
--    Blank it out so no stale binding lingers in the row. (Wrapped in a guard-
--    free UPDATE: if the column was never created, this statement is the only
--    one that would error — remove it in that case.)
UPDATE users SET device_fingerprint = NULL;

-- 4. OPTIONAL / COMMENTED OUT ON PURPOSE — physically dropping the column.
--    Left commented because ALTER TABLE ... DROP COLUMN FAILS HARD if the
--    column does not exist (e.g. a DB where 0003 never ran), which would break
--    this migration. Uncomment only if you have confirmed the column exists.
-- ALTER TABLE users DROP COLUMN device_fingerprint;
