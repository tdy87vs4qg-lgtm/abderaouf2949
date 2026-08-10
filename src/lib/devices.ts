// ============================================================================
// تيسير — Single-device binding: REMOVED / NEUTRALIZED (STEP 1)
//
// The "one account = one device" lock has been REMOVED. Users are never blocked:
// login now succeeds from ANY device, no admin approval is involved, and no
// DEVICE_BLOCKED response can ever be produced by this module.
//
// WHY THIS FILE STILL EXISTS (instead of being deleted):
//   • src/routes/admin.ts imports listPendingDeviceRequests / approveDeviceRequest
//     / rejectDeviceRequest. They are kept here as SAFE NO-OPS so admin.ts keeps
//     compiling untouched (the admin dashboard simply shows an empty list).
//   • The old implementation was SELF-HEALING: it re-created `device_requests`
//     and re-added `users.device_fingerprint` on the hot path (ensureDeviceSchema),
//     so dropping the table by migration alone would NOT have disabled the lock —
//     it had to be neutralized here, in TypeScript. ensureDeviceSchema() is now
//     an inert no-op: NO table is created, NO column is added, NO row is written.
//
// Nothing in this module touches the database anymore. Session cookies, the
// durable device cookie, the subscription gate, Drive, rate limiting and every
// other subsystem are untouched.
//
// Companion migration (manual, NOT auto-run): migrations/0004_remove_device_lock.sql
// ============================================================================

import type { Env } from './drive'

/**
 * Result of the (now always-allow) login-time device check.
 *
 * The `{ ok: false; reason: 'DEVICE_BLOCKED' }` variant is intentionally KEPT in
 * the union for type compatibility with any existing caller/narrowing, but it is
 * never returned anymore.
 */
export type DeviceCheckResult =
  | { ok: true; bound: boolean }
  | { ok: false; reason: 'DEVICE_BLOCKED' }

/** A pending device-switch request (legacy shape — no rows are ever produced). */
export interface DeviceRequestView {
  id: string
  userId: string
  email: string
  deviceInfo: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export type DeviceRequestResult =
  | { ok: true }
  | { ok: false; error: 'NO_DB' | 'NOT_FOUND' | 'ALREADY_RESOLVED' }

/**
 * NO-OP. The device schema is no longer created, repaired or touched in any way.
 *
 * This was the self-healing hook that used to re-add `users.device_fingerprint`
 * and re-create `device_requests` on every login. Neutralizing it here is what
 * actually kills the lock (a migration alone could not).
 */
export async function ensureDeviceSchema(_env: Env): Promise<void> {
  // Intentionally empty: device lock removed.
  return
}

/**
 * Kept for API compatibility only — no longer used for any decision.
 * Returns a plain, non-persisted string; nothing is hashed or stored.
 */
export function deriveFingerprintSource(
  _c: any,
  _clientFingerprint?: unknown,
  _deviceCookieId?: string
): string {
  return 'device-lock-disabled'
}

/** Kept for API compatibility only — a harmless human-readable UA string. */
export function describeDevice(c: any): string {
  try {
    return String(c?.req?.header?.('user-agent') || 'Unknown device').slice(0, 300)
  } catch {
    return 'Unknown device'
  }
}

/**
 * ALWAYS ALLOWS. The single-device lock is removed.
 *
 * Returns `{ ok: true, bound: false }` unconditionally:
 *   • never returns DEVICE_BLOCKED,
 *   • never records a device request,
 *   • never reads or writes users.device_fingerprint,
 *   • never creates any table,
 *   • performs NO database work at all.
 *
 * The `fingerprint` the browser still posts (frontend intentionally untouched in
 * this step) is accepted and ignored.
 */
export async function checkAndBindDevice(
  _env: Env,
  _c: any,
  _userId: string,
  _email: string,
  _clientFingerprint?: unknown
): Promise<DeviceCheckResult> {
  return { ok: true, bound: false }
}

// ---------------------------------------------------------------------------
// Admin operations — SAFE NO-OPS (kept so src/routes/admin.ts still compiles)
// ---------------------------------------------------------------------------

/** NO-OP: always an empty list (there are no device requests anymore). */
export async function listPendingDeviceRequests(_env: Env): Promise<DeviceRequestView[]> {
  return []
}

/** NO-OP: nothing to approve; reported as not found without touching the DB. */
export async function approveDeviceRequest(
  _env: Env,
  _requestId: string
): Promise<DeviceRequestResult> {
  return { ok: false, error: 'NOT_FOUND' }
}

/** NO-OP: nothing to reject; reported as not found without touching the DB. */
export async function rejectDeviceRequest(
  _env: Env,
  _requestId: string
): Promise<DeviceRequestResult> {
  return { ok: false, error: 'NOT_FOUND' }
}
