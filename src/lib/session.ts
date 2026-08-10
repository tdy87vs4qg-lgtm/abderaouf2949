// ============================================================================
// تيسير — Session engine (SERVER-SIDE)
//
// Persistent, long-lived sessions with silent renewal. This is the low-level
// engine used by src/lib/auth.ts (the public helper) and by the auth routes.
//
// Storage strategy (both authoritative-consistent):
//   • KV (SESSIONS binding)  → hot path. O(1) read on every gated request,
//     with a native TTL so expired sessions self-evict. Value stores the
//     resolved user snapshot so a valid request needs ZERO D1 reads.
//   • D1 (sessions table)    → source of truth. Lets the admin dashboard
//     (Task 4B) enumerate/revoke a user's sessions and reset their device.
//
// Only a *keyed digest* of the token is ever stored (see crypto.hashToken):
// the raw token exists solely inside the user's httpOnly cookie.
//
// Persistence contract (Task 4A requirement):
//   - Cookie + session TTL ≈ 1 year.
//   - Sessions are NEVER expired on inactivity/refresh/navigation.
//   - Every successful validation SILENTLY renews the expiry (sliding window),
//     so an active subscriber's session effectively never lapses.
// ============================================================================

import { generateToken, hashToken } from './crypto'
import type { Env } from './drive'

// One year, in seconds / ms.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000
// Only rewrite the store when the remaining lifetime has dropped below this,
// so we don't do a KV/D1 write on literally every request (renew ~daily).
const RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24 // 1 day

/** The public account shape exposed to callers (never includes password_hash). */
export interface SessionUser {
  id: string
  email: string
  role: 'subscriber' | 'admin'
  status: 'active' | 'suspended'
  /**
   * Whether an admin has approved this account for FILE access. Everyone can
   * sign in and browse regardless; only approved accounts (or admins) may open
   * files. Defaults to false for a brand-new self-signup. Admins are always
   * entitled irrespective of this flag.
   */
  approved: boolean
}

/** What we cache in KV per session (self-contained → no D1 read on hot path). */
interface SessionRecord {
  userId: string
  user: SessionUser
  createdAt: string
  expiresAt: string
}

function kvKey(tokenHash: string): string {
  return `session:${tokenHash}`
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
/**
 * Create a new persistent session for a user. Returns the RAW token to be set
 * as the cookie (only the digest is stored). Writes to KV (hot path) and D1
 * (source of truth) when each binding is available.
 */
export async function createSession(
  env: Env,
  user: SessionUser,
  secret: string
): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken()
  const tokenHash = await hashToken(token, secret)
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

  const record: SessionRecord = { userId: user.id, user, createdAt, expiresAt }

  await Promise.all([
    writeKv(env, tokenHash, record),
    writeD1(env, tokenHash, user.id, createdAt, expiresAt),
  ])

  return { token, expiresAt }
}

// ---------------------------------------------------------------------------
// Validate (+ silent renewal)
// ---------------------------------------------------------------------------
/**
 * Validate a raw token. Returns the user when the session is live, else null.
 * Silently slides the expiry forward on success (persistent-session contract).
 * Never throws for a missing/expired session — returns null.
 */
export async function validateSession(
  env: Env,
  rawToken: string | undefined,
  secret: string
): Promise<SessionUser | null> {
  if (!rawToken) return null
  const tokenHash = await hashToken(rawToken, secret)

  const record = await readSession(env, tokenHash)
  if (!record) return null

  // Expiry guard (KV TTL usually handles this, but D1-only records need it).
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await destroyByHash(env, tokenHash)
    return null
  }

  // A suspended account's sessions are dead on arrival.
  if (record.user.status !== 'active') return null

  // Silent renewal (sliding window) — only when close enough to expiry to
  // avoid a write on every single request.
  const remaining = new Date(record.expiresAt).getTime() - Date.now()
  if (remaining < SESSION_TTL_MS - RENEW_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    const renewed: SessionRecord = { ...record, expiresAt: newExpiry }
    // Fire-and-forget style, but await so the record is consistent within req.
    await Promise.all([
      writeKv(env, tokenHash, renewed),
      touchD1(env, tokenHash, newExpiry),
    ])
  }

  return record.user
}

// ---------------------------------------------------------------------------
// Destroy (logout / admin revoke)
// ---------------------------------------------------------------------------
export async function destroySession(
  env: Env,
  rawToken: string | undefined,
  secret: string
): Promise<void> {
  if (!rawToken) return
  const tokenHash = await hashToken(rawToken, secret)
  await destroyByHash(env, tokenHash)
}

async function destroyByHash(env: Env, tokenHash: string): Promise<void> {
  await Promise.all([
    env.SESSIONS ? env.SESSIONS.delete(kvKey(tokenHash)) : Promise.resolve(),
    env.DB
      ? env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(tokenHash).run()
      : Promise.resolve(),
  ])
}

// ---------------------------------------------------------------------------
// Revoke ALL sessions for a user (admin deactivate / password reset / demote)
//
// Why this exists (Task 4B): the KV hot-path record embeds a `user` snapshot,
// so a session that was minted while the account was active still carries
// status:'active' in KV. Simply flipping the D1 `users.status` would NOT lock
// the user out until that KV entry expired. To make deactivation INSTANT we
// enumerate the user's session token digests from D1 (source of truth) and
// delete each from BOTH KV and D1. After this returns the user has zero live
// sessions and the middleware rejects them on the very next request.
//
// D1 is authoritative for "which tokens belong to this user", which is exactly
// why the digests are mirrored there and not only in KV.
// ---------------------------------------------------------------------------
export async function revokeAllUserSessions(env: Env, userId: string): Promise<void> {
  if (!env.DB) {
    // Without D1 we can't enumerate a user's KV keys (KV isn't queryable by
    // value). D1 is required for this operation; nothing to do otherwise.
    return
  }

  const { results } = await env.DB.prepare(
    'SELECT token FROM sessions WHERE user_id = ?'
  )
    .bind(userId)
    .all<{ token: string }>()

  const hashes = (results || []).map((r) => r.token)

  // Delete each session from KV (hot path) so the cached snapshot is gone.
  if (env.SESSIONS && hashes.length) {
    await Promise.all(hashes.map((h) => env.SESSIONS!.delete(kvKey(h))))
  }

  // Delete them from D1 (source of truth) in one statement.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run()
}

// ---------------------------------------------------------------------------
// Refresh the cached user snapshot for ALL of a user's live sessions.
//
// The KV hot-path record embeds a `user` snapshot (so a valid request needs
// zero D1 reads). When an admin changes something that must take effect
// immediately WITHOUT logging the person out — e.g. approving/un-approving an
// account for file access — flipping the D1 `users` row is not enough on its
// own, because the KV snapshot would keep the stale value until it expires.
//
// This walks the user's session token digests from D1 (source of truth), reads
// the freshly-updated user row once, and rewrites each KV record with the new
// snapshot (preserving each session's own expiry). D1's `sessions` table stores
// no user fields, so it needs no update. The result: the change is live on the
// user's very next request and they stay signed in (persistent session intact).
// ---------------------------------------------------------------------------
export async function refreshUserSessions(env: Env, userId: string): Promise<void> {
  if (!env.DB) return

  // Fresh snapshot from the source of truth.
  const u = await env.DB.prepare(
    `SELECT id, email, role, status, approved FROM users WHERE id = ?`
  )
    .bind(userId)
    .first<{
      id: string
      email: string
      role: 'subscriber' | 'admin'
      status: 'active' | 'suspended'
      approved: number
    }>()
  if (!u) return

  const user: SessionUser = {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    approved: !!u.approved,
  }

  if (!env.SESSIONS) return // nothing cached to refresh

  const { results } = await env.DB.prepare(
    'SELECT token, created_at AS createdAt, expires_at AS expiresAt FROM sessions WHERE user_id = ?'
  )
    .bind(userId)
    .all<{ token: string; createdAt: string; expiresAt: string }>()

  await Promise.all(
    (results || []).map((r) => {
      const record: SessionRecord = {
        userId,
        user,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      }
      return writeKv(env, r.token, record)
    })
  )
}

// ---------------------------------------------------------------------------
// Storage adapters (KV preferred on read; D1 fallback keeps things working
// even if the KV namespace isn't bound yet in a given environment).
// ---------------------------------------------------------------------------
async function readSession(env: Env, tokenHash: string): Promise<SessionRecord | null> {
  // 1. KV hot path.
  if (env.SESSIONS) {
    const raw = await env.SESSIONS.get(kvKey(tokenHash))
    if (raw) {
      try {
        return JSON.parse(raw) as SessionRecord
      } catch {
        /* fall through to D1 */
      }
    }
  }

  // 2. D1 source of truth (also rehydrates the user snapshot).
  if (env.DB) {
    const row = await env.DB.prepare(
      `SELECT s.user_id AS userId, s.created_at AS createdAt, s.expires_at AS expiresAt,
              u.email AS email, u.role AS role, u.status AS status, u.approved AS approved
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`
    )
      .bind(tokenHash)
      .first<{
        userId: string
        createdAt: string
        expiresAt: string
        email: string
        role: 'subscriber' | 'admin'
        status: 'active' | 'suspended'
        approved: number
      }>()

    if (row) {
      const record: SessionRecord = {
        userId: row.userId,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        user: {
          id: row.userId,
          email: row.email,
          role: row.role,
          status: row.status,
          approved: !!row.approved,
        },
      }
      // Warm KV so subsequent reads skip D1.
      await writeKv(env, tokenHash, record).catch(() => {})
      return record
    }
  }

  return null
}

async function writeKv(env: Env, tokenHash: string, record: SessionRecord): Promise<void> {
  if (!env.SESSIONS) return
  await env.SESSIONS.put(kvKey(tokenHash), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
}

async function writeD1(
  env: Env,
  tokenHash: string,
  userId: string,
  createdAt: string,
  expiresAt: string
): Promise<void> {
  if (!env.DB) return
  await env.DB.prepare(
    `INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, userId, createdAt, expiresAt)
    .run()
}

async function touchD1(env: Env, tokenHash: string, expiresAt: string): Promise<void> {
  if (!env.DB) return
  await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
    .bind(expiresAt, tokenHash)
    .run()
}
