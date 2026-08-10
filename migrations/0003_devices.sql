-- ============================================================================
-- تيسير — Single-device binding + admin approval of new devices
--
-- Layers a "one allowed device per account" rule on top of the existing auth.
-- The FIRST successful login binds the account to that device's fingerprint
-- (stored as a keyed digest — the raw fingerprint never touches the DB). A
-- later login from a DIFFERENT device is blocked server-side, and a pending
-- request row is created for an admin to review from the dashboard.
--
--   users.device_fingerprint  NULL  → no device bound yet; next login binds it.
--                             set   → only that exact device may sign in.
--
-- Approving a pending request overwrites users.device_fingerprint with the new
-- device's digest (so the new device becomes THE allowed device) and marks the
-- request approved. Rejecting simply marks the request rejected — the account
-- stays bound to its previous device.
-- ============================================================================

-- The account's single allowed device (keyed SHA-256/HMAC digest of the raw
-- fingerprint). NULL until the first login binds it. Only a digest is stored.
ALTER TABLE users ADD COLUMN device_fingerprint TEXT;

-- Pending / resolved requests to switch an account to a new device. One row is
-- created every time a login is blocked because it came from a device other
-- than the account's bound one. Admins Approve (→ rebind) or Reject them.
CREATE TABLE IF NOT EXISTS device_requests (
  id                  TEXT PRIMARY KEY,             -- opaque uuid
  user_id             TEXT NOT NULL,                -- account being requested
  email               TEXT NOT NULL,               -- denormalised for easy admin listing
  device_fingerprint  TEXT NOT NULL,               -- digest of the NEW device requesting access
  device_info         TEXT,                         -- human-readable UA / platform hint
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at         TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_requests_status ON device_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_requests_user_id ON device_requests(user_id);
-- At most one OPEN (pending) request per account+device, so repeated blocked
-- logins from the same new device don't pile up duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_requests_open
  ON device_requests(user_id, device_fingerprint)
  WHERE status = 'pending';
