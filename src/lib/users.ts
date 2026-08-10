// ============================================================================
// تيسير — Account management (SERVER-SIDE) — Task 4B
//
// The single seam for provisioning + managing accounts in D1. There is NO
// public self-signup: every function here is only ever reached through the
// admin-guarded routes in src/routes/admin.ts. Keeping the SQL + validation in
// one place means the (later) admin UI in Task 9 just calls these endpoints.
//
// Roles (fully wired in 4B):
//   • 'admin'      — can create / edit / deactivate / reactivate accounts.
//   • 'subscriber' — will view files (gating itself lands in Part C).
//
// Status:
//   • 'active'    — may log in and hold live sessions.
//   • 'suspended' — cannot log in; ALL existing sessions are revoked instantly
//                   (see deactivateUser → revokeAllUserSessions) so a
//                   deactivated account is locked out on its very next request.
//
// Security: passwords are always PBKDF2-hashed via src/lib/crypto.ts before
// they touch the database; plaintext is never stored or logged. No secrets are
// hardcoded here.
// ============================================================================

import type { Env } from './drive'
import { hashPassword, generateId, verifyPassword } from './crypto'
import { revokeAllUserSessions, refreshUserSessions } from './session'

// Re-exported below via resetUserDevice.

export type Role = 'subscriber' | 'admin'
export type Status = 'active' | 'suspended'

/** Public account shape returned to admin callers (never includes the hash). */
export interface AccountView {
  id: string
  email: string
  role: Role
  status: Status
  /**
   * Admin-controlled file-access flag. A brand-new self-signup starts
   * `approved = false` (locked): the user can log in and browse everything, but
   * every file stays locked until an admin approves them. Admins are always
   * entitled regardless of this flag.
   */
  approved: boolean
  createdAt: string
}

/** Discriminated result so callers get typed, explicit error codes. */
export type AccountResult =
  | { ok: true; account: AccountView }
  | { ok: false; error: AccountError }

export type AccountError =
  | 'NO_DB'
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'INVALID_ROLE'
  | 'EMAIL_TAKEN'
  | 'NOT_FOUND'
  | 'NOTHING_TO_UPDATE'
  | 'CANNOT_DEMOTE_SELF'
  | 'CANNOT_SUSPEND_SELF'
  | 'DB_ERROR'

// ---------------------------------------------------------------------------
// Validation (never trusted from the client — enforced server-side here).
// ---------------------------------------------------------------------------
const MIN_PASSWORD = 8
const MAX_PASSWORD = 1024
const MAX_EMAIL = 254

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_EMAIL
}

function isValidPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= MIN_PASSWORD && pw.length <= MAX_PASSWORD
}

function isValidRole(role: unknown): role is Role {
  return role === 'subscriber' || role === 'admin'
}

// ---------------------------------------------------------------------------
// Row → view mapper
// ---------------------------------------------------------------------------
interface UserRow {
  id: string
  email: string
  role: Role
  status: Status
  approved: number
  created_at: string
}

function toView(row: UserRow): AccountView {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    approved: !!row.approved,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Self-healing schema guarantee
//
// ROOT CAUSE OF THE "signup is broken" BUG: in a deployed environment the D1
// migrations may not have been fully applied (e.g. 0002_approval added the
// `approved` column but never ran against the production DB, or the tables were
// never created at all). When that happens the signup INSERT throws a SQL error
// ("no such table: users" / "table users has no column named approved"), which
// used to be swallowed by the catch below and mis-reported as EMAIL_TAKEN — so
// EVERY signup failed with a misleading "email already in use" message.
//
// To make signup bullet-proof regardless of migration state, we idempotently
// ensure the schema exists at runtime before the first write. All statements
// use IF NOT EXISTS / defensive ALTERs, so this is a cheap no-op once the tables
// are correct, and it self-repairs a partially-migrated deployed database.
//
// This runs once per isolate (memoised) so it doesn't add overhead per request.
// ---------------------------------------------------------------------------
let schemaEnsured = false

export async function ensureSchema(env: Env): Promise<void> {
  if (!env.DB || schemaEnsured) return

  // 1. Base tables (mirrors migrations/0001_auth.sql). CREATE TABLE IF NOT
  //    EXISTS is a no-op when they already exist.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
       id             TEXT PRIMARY KEY,
       email          TEXT NOT NULL,
       email_lower    TEXT NOT NULL UNIQUE,
       password_hash  TEXT NOT NULL,
       role           TEXT NOT NULL DEFAULT 'subscriber'
                        CHECK (role IN ('subscriber', 'admin')),
       status         TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended')),
       approved       INTEGER NOT NULL DEFAULT 0,
       created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     )`
  ).run()

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
       token       TEXT PRIMARY KEY,
       user_id     TEXT NOT NULL,
       created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       expires_at  TEXT NOT NULL,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     )`
  ).run()

  // 2. Repair the case where `users` predates the approval migration and is
  //    missing the `approved` column. SQLite has no "ADD COLUMN IF NOT EXISTS",
  //    so we detect via PRAGMA and add it only when absent (grandfathering the
  //    existing rows as approved, exactly like migration 0002).
  try {
    const { results } = await env.DB.prepare(`PRAGMA table_info(users)`).all<{
      name: string
    }>()
    const hasApproved = (results || []).some((r) => r.name === 'approved')
    if (!hasApproved) {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0`
      ).run()
      // Grandfather everyone who already existed before approval landed.
      await env.DB.prepare(`UPDATE users SET approved = 1`).run()
    }
  } catch {
    /* PRAGMA/ALTER best-effort; a correct schema simply skips this. */
  }

  // 3. Indexes (all IF NOT EXISTS).
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(email_lower)`
  ).run()
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved)`
  ).run()
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`
  ).run()
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`
  ).run()

  schemaEnsured = true
}

/** True when a thrown DB error is specifically a UNIQUE-constraint violation. */
function isUniqueViolation(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '').toLowerCase()
  return (
    msg.includes('unique') ||
    msg.includes('constraint failed') ||
    msg.includes('2067') || // SQLITE_CONSTRAINT_UNIQUE
    msg.includes('1555') // SQLITE_CONSTRAINT_PRIMARYKEY
  )
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function listAccounts(env: Env): Promise<AccountView[]> {
  if (!env.DB) return []
  const { results } = await env.DB.prepare(
    `SELECT id, email, role, status, approved, created_at
       FROM users ORDER BY created_at DESC`
  ).all<UserRow>()
  return (results || []).map(toView)
}

/** Aggregate subscriber counts for the admin stats overview (Task 9). */
export interface SubscriberStats {
  /** Every account whose role is 'subscriber' (any status). */
  totalSubscribers: number
  /** Subscribers whose status is 'active' (i.e. may currently log in). */
  activeSubscribers: number
  /** Subscribers an admin has approved for full file access. */
  approvedSubscribers: number
  /** Subscribers still awaiting approval (locked — can browse, files gated). */
  pendingSubscribers: number
}

/**
 * Compute subscriber stats server-side directly from D1. "Subscriber" means an
 * account with role = 'subscriber'; admins are excluded from these counts.
 * Returns zeroes when no DB binding is present (sample / unconfigured mode).
 */
export async function getSubscriberStats(env: Env): Promise<SubscriberStats> {
  if (!env.DB)
    return { totalSubscribers: 0, activeSubscribers: 0, approvedSubscribers: 0, pendingSubscribers: 0 }
  const row = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
       COALESCE(SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END), 0) AS approved,
       COALESCE(SUM(CASE WHEN approved = 0 THEN 1 ELSE 0 END), 0) AS pending
     FROM users
     WHERE role = 'subscriber'`
  ).first<{ total: number; active: number; approved: number; pending: number }>()
  return {
    totalSubscribers: Number(row?.total ?? 0),
    activeSubscribers: Number(row?.active ?? 0),
    approvedSubscribers: Number(row?.approved ?? 0),
    pendingSubscribers: Number(row?.pending ?? 0),
  }
}

export async function getAccount(env: Env, id: string): Promise<AccountView | null> {
  if (!env.DB) return null
  const row = await env.DB.prepare(
    `SELECT id, email, role, status, approved, created_at FROM users WHERE id = ?`
  )
    .bind(id)
    .first<UserRow>()
  return row ? toView(row) : null
}

// ---------------------------------------------------------------------------
// Create (admin-only)
// ---------------------------------------------------------------------------
export interface CreateAccountInput {
  email: string
  password: string
  role?: Role
  status?: Status
  /**
   * File-access approval. Omit (or pass true) for the admin "New subscriber"
   * form — an admin creating an account is an implicit approval. The open
   * self-signup path passes `false` so every new self-registered account starts
   * LOCKED until an admin approves it.
   */
  approved?: boolean
}

export async function createAccount(
  env: Env,
  input: CreateAccountInput
): Promise<AccountResult> {
  if (!env.DB) return { ok: false, error: 'NO_DB' }

  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : ''
  if (!isValidEmail(email)) return { ok: false, error: 'INVALID_EMAIL' }
  if (!isValidPassword(input.password)) return { ok: false, error: 'WEAK_PASSWORD' }

  const role: Role = input.role ?? 'subscriber'
  if (!isValidRole(role)) return { ok: false, error: 'INVALID_ROLE' }
  const status: Status = input.status === 'suspended' ? 'suspended' : 'active'
  // Admins are always entitled; otherwise honour the requested approval (admin
  // form → approved by default; self-signup → explicitly false = locked).
  const approved = role === 'admin' ? 1 : input.approved === false ? 0 : input.approved ? 1 : 1

  // Guarantee the schema exists/matches BEFORE any read or write. This makes
  // signup work even against a deployed DB whose migrations were never (fully)
  // applied — the exact failure that made signup look broken.
  try {
    await ensureSchema(env)
  } catch (e) {
    console.error('[createAccount] ensureSchema failed:', e)
    return { ok: false, error: 'DB_ERROR' }
  }

  // Uniqueness check (email_lower has a UNIQUE constraint; we check first for a
  // clean error and still catch the constraint below as a race backstop).
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE email_lower = ?`
  )
    .bind(email)
    .first<{ id: string }>()
  if (existing) return { ok: false, error: 'EMAIL_TAKEN' }

  const id = generateId()
  const passwordHash = await hashPassword(input.password)

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, email_lower, password_hash, role, status, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, email, email, passwordHash, role, status, approved)
      .run()
  } catch (e) {
    // ONLY a genuine UNIQUE/PK constraint violation means the email is taken
    // (a race with a concurrent signup). Any OTHER SQL error (missing column,
    // missing table, etc.) must NOT be disguised as EMAIL_TAKEN — surface it as
    // a real DB error so the true cause is visible instead of a misleading
    // "email already in use". This is the fix for the broken-signup report.
    if (isUniqueViolation(e)) {
      return { ok: false, error: 'EMAIL_TAKEN' }
    }
    console.error('[createAccount] INSERT failed:', e)
    return { ok: false, error: 'DB_ERROR' }
  }

  const account = await getAccount(env, id)
  return account
    ? { ok: true, account }
    : { ok: false, error: 'NOT_FOUND' }
}

// ---------------------------------------------------------------------------
// Open self-signup (PUBLIC)
//
// Anyone may create their own account with just an email + password. The
// account is created immediately and stays permanently. It is ALWAYS a
// 'subscriber' (never an admin — role can't be chosen here), it is 'active'
// (so the person can log in right away), and crucially it starts LOCKED
// (approved = 0): the user can browse everything but every file is gated behind
// the contact/subscription popup until an admin approves them.
// ---------------------------------------------------------------------------
export async function signupAccount(
  env: Env,
  email: string,
  password: string
): Promise<AccountResult> {
  return createAccount(env, {
    email,
    password,
    role: 'subscriber',
    status: 'active',
    approved: false, // locked until an admin approves
  })
}

// ---------------------------------------------------------------------------
// Admin bootstrap from environment (Task 11 / deploy)
//
// Production must never rely on the hardcoded dev seed rows in seed.sql. Instead
// the FIRST admin is provisioned from the Cloudflare secrets ADMIN_SEED_EMAIL /
// ADMIN_SEED_PASSWORD. This runs idempotently on the login path (see
// src/routes/auth.ts): the very first time the seed admin signs in with the
// configured credentials the row is created (or an existing account with that
// email is promoted to an active admin and its password aligned to the secret).
//
// Design notes:
//   • Purely env-driven — no credentials are ever hardcoded here.
//   • Idempotent + race-safe: a UNIQUE(email_lower) constraint means concurrent
//     bootstraps collapse to a single row; we simply re-read afterwards.
//   • Cheap in steady state: once the admin exists and already matches, we make
//     zero writes, so it is safe to call on every login attempt.
//   • Never logs or returns the password.
// ---------------------------------------------------------------------------
export interface SeedAdminResult {
  /** 'created' | 'updated' | 'unchanged' | 'skipped' (env not configured / no DB). */
  action: 'created' | 'updated' | 'unchanged' | 'skipped'
}

export async function seedAdminFromEnv(env: Env): Promise<SeedAdminResult> {
  if (!env.DB) return { action: 'skipped' }

  const rawEmail = env.ADMIN_SEED_EMAIL
  const rawPassword = env.ADMIN_SEED_PASSWORD
  // Bootstrap only when BOTH secrets are present and valid. Otherwise the app
  // keeps working with whatever admin already exists in D1 (or the dev seed).
  if (!rawEmail || !rawPassword) return { action: 'skipped' }

  const email = normalizeEmail(String(rawEmail))
  const password = String(rawPassword)
  if (!isValidEmail(email) || !isValidPassword(password)) return { action: 'skipped' }

  // Ensure the schema exists before the admin bootstrap touches `users`.
  try {
    await ensureSchema(env)
  } catch {
    return { action: 'skipped' }
  }

  const existing = await env.DB.prepare(
    `SELECT id, password_hash AS passwordHash, role, status
       FROM users WHERE email_lower = ?`
  )
    .bind(email)
    .first<{ id: string; passwordHash: string; role: Role; status: Status }>()

  // Fresh install → create the seed admin.
  if (!existing) {
    const id = generateId()
    const passwordHash = await hashPassword(password)
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, email, email_lower, password_hash, role, status, approved)
         VALUES (?, ?, ?, ?, 'admin', 'active', 1)`
      )
        .bind(id, email, email, passwordHash)
        .run()
      return { action: 'created' }
    } catch {
      // UNIQUE race: another request created it first — treat as unchanged.
      return { action: 'unchanged' }
    }
  }

  // Account already exists for this email. Ensure it is an active admin whose
  // password matches the configured secret (so rotating ADMIN_SEED_PASSWORD in
  // Cloudflare re-aligns the account on the next successful bootstrap login).
  const passwordMatches = await verifyPassword(password, existing.passwordHash)
  const needsUpdate =
    existing.role !== 'admin' || existing.status !== 'active' || !passwordMatches

  if (!needsUpdate) return { action: 'unchanged' }

  const passwordHash = passwordMatches ? existing.passwordHash : await hashPassword(password)
  await env.DB.prepare(
    `UPDATE users SET role = 'admin', status = 'active', approved = 1, password_hash = ? WHERE id = ?`
  )
    .bind(passwordHash, existing.id)
    .run()
  return { action: 'updated' }
}

// ---------------------------------------------------------------------------
// Edit (admin-only) — email / password / role. Status handled separately by
// deactivate/reactivate so session revocation is never forgotten.
// ---------------------------------------------------------------------------
export interface UpdateAccountInput {
  email?: string
  password?: string
  role?: Role
}

export async function updateAccount(
  env: Env,
  id: string,
  input: UpdateAccountInput,
  actingAdminId: string
): Promise<AccountResult> {
  if (!env.DB) return { ok: false, error: 'NO_DB' }

  const current = await getAccount(env, id)
  if (!current) return { ok: false, error: 'NOT_FOUND' }

  const sets: string[] = []
  const binds: unknown[] = []

  if (input.email !== undefined) {
    const email = normalizeEmail(String(input.email))
    if (!isValidEmail(email)) return { ok: false, error: 'INVALID_EMAIL' }
    // Reject if the new email belongs to a DIFFERENT account.
    const clash = await env.DB.prepare(
      `SELECT id FROM users WHERE email_lower = ? AND id <> ?`
    )
      .bind(email, id)
      .first<{ id: string }>()
    if (clash) return { ok: false, error: 'EMAIL_TAKEN' }
    sets.push('email = ?', 'email_lower = ?')
    binds.push(email, email)
  }

  if (input.password !== undefined) {
    if (!isValidPassword(input.password)) return { ok: false, error: 'WEAK_PASSWORD' }
    const hash = await hashPassword(input.password)
    sets.push('password_hash = ?')
    binds.push(hash)
  }

  let roleChangedToNonAdmin = false
  if (input.role !== undefined) {
    if (!isValidRole(input.role)) return { ok: false, error: 'INVALID_ROLE' }
    // An admin may not demote themselves (avoids locking out the last admin
    // by accident); a different admin can still do it.
    if (id === actingAdminId && current.role === 'admin' && input.role !== 'admin') {
      return { ok: false, error: 'CANNOT_DEMOTE_SELF' }
    }
    if (current.role === 'admin' && input.role !== 'admin') roleChangedToNonAdmin = true
    sets.push('role = ?')
    binds.push(input.role)
  }

  if (sets.length === 0) return { ok: false, error: 'NOTHING_TO_UPDATE' }

  binds.push(id)
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()

  // Security: if we changed the password or reduced privileges, existing
  // sessions must not silently keep their stale cached snapshot. Revoke them
  // so the change takes effect on the next request.
  if (input.password !== undefined || roleChangedToNonAdmin) {
    await revokeAllUserSessions(env, id)
  }

  const account = await getAccount(env, id)
  return account ? { ok: true, account } : { ok: false, error: 'NOT_FOUND' }
}

// ---------------------------------------------------------------------------
// Deactivate / Reactivate (admin-only)
//
// Deactivating flips status → 'suspended' AND revokes every live session for
// that user (D1 + KV) so the lock-out is INSTANT — the middleware rejects the
// account on its next request even though KV cached a snapshot.
// ---------------------------------------------------------------------------
export async function deactivateUser(
  env: Env,
  id: string,
  actingAdminId: string
): Promise<AccountResult> {
  if (!env.DB) return { ok: false, error: 'NO_DB' }
  const current = await getAccount(env, id)
  if (!current) return { ok: false, error: 'NOT_FOUND' }
  // An admin cannot deactivate their own account (self-lockout guard).
  if (id === actingAdminId) return { ok: false, error: 'CANNOT_SUSPEND_SELF' }

  await env.DB.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`)
    .bind(id)
    .run()

  // INSTANT invalidation of all sessions for this user.
  await revokeAllUserSessions(env, id)

  const account = await getAccount(env, id)
  return account ? { ok: true, account } : { ok: false, error: 'NOT_FOUND' }
}

export async function reactivateUser(env: Env, id: string): Promise<AccountResult> {
  if (!env.DB) return { ok: false, error: 'NO_DB' }
  const current = await getAccount(env, id)
  if (!current) return { ok: false, error: 'NOT_FOUND' }

  await env.DB.prepare(`UPDATE users SET status = 'active' WHERE id = ?`)
    .bind(id)
    .run()
  // Reactivation does NOT restore old sessions (they were destroyed); the user
  // simply logs in again. Nothing to revoke here.

  const account = await getAccount(env, id)
  return account ? { ok: true, account } : { ok: false, error: 'NOT_FOUND' }
}

// ---------------------------------------------------------------------------
// Reset device (admin-only)
//
// "Reset device" unbinds a subscriber from whatever device/browser they are
// currently signed in on by destroying ALL of their live sessions (D1 + KV)
// via revokeAllUserSessions. Unlike deactivate, it does NOT change the
// account status — the account stays 'active' and the person can simply sign
// in again (now on a fresh device). This is the support action for "I got a
// new phone / laptop and can't log in on my old one", or to force a re-login
// after a lost/shared device, without suspending the account.
//
// After this returns the user holds zero sessions and is logged out on their
// old device on its very next request (the middleware finds no live session).
// ---------------------------------------------------------------------------
export async function resetUserDevice(env: Env, id: string): Promise<AccountResult> {
  if (!env.DB) return { ok: false, error: 'NO_DB' }
  const current = await getAccount(env, id)
  if (!current) return { ok: false, error: 'NOT_FOUND' }

  // Destroy every live session for this user (does NOT touch account status).
  await revokeAllUserSessions(env, id)

  const account = await getAccount(env, id)
  return account ? { ok: true, account } : { ok: false, error: 'NOT_FOUND' }
}

// ---------------------------------------------------------------------------
// Approve / Un-approve (admin-only) — file-access gate
//
// This is the heart of the new account model. Approving flips `approved → 1`;
// un-approving flips it back to 0 (re-locking the account). In BOTH cases the
// user stays logged in — we DON'T revoke their sessions. Instead we refresh the
// cached session snapshot (refreshUserSessions) so the new entitlement is live
// on their very next request while the persistent session is preserved.
//   • approve   → files open immediately (no re-login needed).
//   • unapprove → files re-lock immediately; the user keeps browsing but hits
//                 the contact popup again on any file.
// ---------------------------------------------------------------------------
export async function setUserApproval(
  env: Env,
  id: string,
  approved: boolean
): Promise<AccountResult> {
  if (!env.DB) return { ok: false, error: 'NO_DB' }
  const current = await getAccount(env, id)
  if (!current) return { ok: false, error: 'NOT_FOUND' }

  await env.DB.prepare(`UPDATE users SET approved = ? WHERE id = ?`)
    .bind(approved ? 1 : 0, id)
    .run()

  // Make the change live instantly for any device the user is signed in on,
  // WITHOUT logging them out (persistent session preserved).
  await refreshUserSessions(env, id)

  const account = await getAccount(env, id)
  return account ? { ok: true, account } : { ok: false, error: 'NOT_FOUND' }
}

// ---------------------------------------------------------------------------
// Human-friendly error → HTTP status + message mapping (used by routes).
// ---------------------------------------------------------------------------
export function accountErrorResponse(error: AccountError): {
  status: 400 | 403 | 404 | 409 | 503
  message: string
} {
  switch (error) {
    case 'NO_DB':
      return { status: 503, message: 'Account store is unavailable.' }
    case 'INVALID_EMAIL':
      return { status: 400, message: 'A valid email address is required.' }
    case 'WEAK_PASSWORD':
      return { status: 400, message: 'Password must be at least 8 characters.' }
    case 'INVALID_ROLE':
      return { status: 400, message: "Role must be 'subscriber' or 'admin'." }
    case 'EMAIL_TAKEN':
      return { status: 409, message: 'That email is already in use.' }
    case 'NOT_FOUND':
      return { status: 404, message: 'Account not found.' }
    case 'NOTHING_TO_UPDATE':
      return { status: 400, message: 'No changes were supplied.' }
    case 'CANNOT_DEMOTE_SELF':
      return { status: 403, message: 'You cannot remove your own admin role.' }
    case 'CANNOT_SUSPEND_SELF':
      return { status: 403, message: 'You cannot deactivate your own account.' }
    case 'DB_ERROR':
      return { status: 503, message: 'Could not save the account right now. Please try again.' }
  }
}
