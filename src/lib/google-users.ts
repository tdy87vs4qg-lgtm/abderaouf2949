// ============================================================================
// تيسير — Google identity → account resolution  (PART B-2, SERVER-SIDE ONLY)
//
// This is the SECOND half of "Sign in with Google". Part B-1
// (src/lib/google-oauth-callback.ts) validates the CSRF `state`, exchanges the
// authorization `code`, and produces a VERIFIED identity:
//
//     VerifiedGoogleIdentity = { googleId, email, emailVerified: true, name?, picture? }
//
// The handoff is IN-PROCESS — nothing is persisted between the two legs (no KV
// record, no cookie, no D1 row carries the identity). This module takes that
// object and does EXACTLY ONE thing:
//
//     verified identity  →  the D1 `users` row that owns it (found or created)
//                        →  a SessionUser snapshot ready for createSession()
//
// It DELIBERATELY does NOT touch the session cookie, KV, Drive, the approval
// gate's semantics, or anything the route layer owns. Issuing the session is
// done by the CALLER with the EXISTING mechanism, unchanged:
//     createSession(env, user, getSessionSecret(env))  →  setSessionCookie(c, …)
// (see src/routes/auth.ts → GET /api/auth/google/callback).
//
// ---------------------------------------------------------------------------
// LOOKUP / CREATION RULES
// ---------------------------------------------------------------------------
//  1. Look the account up by `google_id` first — it is Google's stable, never
//     reused `sub`, so it survives the user renaming their Gmail address.
//  2. Otherwise look it up by `email_lower` (the app's canonical, normalised
//     login identifier used everywhere else). A hit here means the person
//     already had a password account with that address: we LINK it by writing
//     `google_id` onto the existing row instead of creating a duplicate.
//     This is only safe because Google itself asserted `email_verified` — an
//     unverified address is refused back in Part B-1.
//  3. No row at all → CREATE one:
//        role     = 'subscriber'   (never admin — a role can't be self-chosen)
//        status   = 'active'       (they can sign in and browse immediately)
//        approved = 0              (LOCKED — identical to open self-signup:
//                                   every file stays behind the subscription /
//                                   contact popup until an admin approves)
//     …then log them in. The approval/subscription gate is therefore preserved
//     byte-for-byte: Google sign-in grants a SESSION, never entitlement.
//
// A 'suspended' account is refused (ACCOUNT_SUSPENDED) exactly like the
// password login path — Google sign-in must not be a way around a suspension.
//
// ---------------------------------------------------------------------------
// PASSWORDS
// ---------------------------------------------------------------------------
// `users.password_hash` is NOT NULL, so a Google-only account is created with a
// deliberately UNUSABLE placeholder (see GOOGLE_ONLY_PASSWORD_HASH). It is not
// a hash of anything: it does not match the `pbkdf2$…` 5-part format that
// crypto.ts → verifyPassword() requires, so verifyPassword() returns false for
// EVERY input. A Google-only account therefore can never be signed into with a
// password, and no plaintext or guessable secret is stored. Linking a Google id
// onto an existing password account NEVER modifies that account's real hash.
//
// ---------------------------------------------------------------------------
// SCHEMA
// ---------------------------------------------------------------------------
// The `google_id` column ships as migrations/0005_google_oauth.sql, which is
// NOT auto-run (apply it manually with wrangler, exactly like 0004).
// `ensureGoogleAuthSchema()` below is the same defensive, idempotent runtime
// guard the codebase already uses in users.ts → ensureSchema(): it adds the
// column only when PRAGMA table_info says it is absent, so a deployment whose
// migrations were never applied degrades to "adds the column once" instead of
// crashing every Google login with "no such column: google_id". It is memoised
// per isolate and is a pure no-op once the schema is correct.
// ============================================================================

import type { Env } from './drive'
import { generateId } from './crypto'
import type { SessionUser } from './session'
import { ensureSchema, isValidEmail, normalizeEmail, seedAdminFromEnv } from './users'
import type { VerifiedGoogleIdentity } from './google-oauth-callback'

/**
 * Placeholder written to `password_hash` for accounts created through Google.
 * Intentionally NOT a valid `pbkdf2$<hash>$<iter>$<salt>$<key>` string, so
 * crypto.ts → verifyPassword() rejects every candidate password against it.
 */
export const GOOGLE_ONLY_PASSWORD_HASH = 'google-oauth:no-password'

/** Stable, non-sensitive failure codes (safe to return to the browser). */
export type GoogleLoginErrorCode =
  /** No D1 binding — accounts cannot be read or written. */
  | 'AUTH_UNAVAILABLE'
  /** The verified email did not survive normalisation (defensive only). */
  | 'INVALID_EMAIL'
  /** The matched account is suspended; Google must not bypass that. */
  | 'ACCOUNT_SUSPENDED'
  /** A D1 read/write failed. */
  | 'DB_ERROR'

export type GoogleLoginResult =
  | { ok: true; user: SessionUser; created: boolean; linked: boolean }
  | { ok: false; error: GoogleLoginErrorCode }

/** The columns this module reads off `users`. */
interface GoogleUserRow {
  id: string
  email: string
  role: 'subscriber' | 'admin'
  status: 'active' | 'suspended'
  approved: number
  googleId: string | null
}

function toSessionUser(row: GoogleUserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    approved: !!row.approved,
  }
}

// ---------------------------------------------------------------------------
// Defensive schema guarantee (mirrors users.ts → ensureSchema)
// ---------------------------------------------------------------------------
let googleSchemaEnsured = false

/**
 * Idempotently make sure `users.google_id` exists (plus its partial unique
 * index). Memoised per isolate; a correct schema makes this a no-op.
 *
 * This is NOT the migration — migrations/0005_google_oauth.sql is applied
 * manually. It is the same self-healing safety net users.ts already applies for
 * the `approved` column, so a partially-migrated database can never turn a
 * Google login into a 500.
 */
export async function ensureGoogleAuthSchema(env: Env): Promise<void> {
  if (!env.DB || googleSchemaEnsured) return

  // Base tables + the `approved` column first (reused verbatim, unchanged).
  await ensureSchema(env)

  try {
    const { results } = await env.DB.prepare(`PRAGMA table_info(users)`).all<{
      name: string
    }>()
    const columns = (results || []).map((r) => r.name)

    if (!columns.includes('google_id')) {
      // Nullable on purpose: password-only accounts keep google_id = NULL.
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN google_id TEXT`).run()
    }

    // Partial UNIQUE index: one Google account can own at most one row, while
    // any number of rows may keep google_id = NULL.
    await env.DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
         ON users(google_id) WHERE google_id IS NOT NULL`
    ).run()
  } catch {
    /* Best-effort: a correct schema simply skips this. */
  }

  googleSchemaEnsured = true
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const USER_COLUMNS = `id, email, role, status, approved, google_id AS googleId`

/** Find the account owning this Google `sub`, or null. */
export async function findUserByGoogleId(
  env: Env,
  googleId: string
): Promise<GoogleUserRow | null> {
  if (!env.DB) return null
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE google_id = ?`
  )
    .bind(googleId)
    .first<GoogleUserRow>()
  return row || null
}

/** Find the account owning this (already normalised) email, or null. */
export async function findUserByEmail(
  env: Env,
  emailLower: string
): Promise<GoogleUserRow | null> {
  if (!env.DB) return null
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE email_lower = ?`
  )
    .bind(emailLower)
    .first<GoogleUserRow>()
  return row || null
}

// ---------------------------------------------------------------------------
// Find-or-create (the whole of Part B-2's data work, in one call)
// ---------------------------------------------------------------------------

/**
 * Resolve the VERIFIED Google identity produced by Part B-1 into the D1 account
 * that owns it, creating that account when it does not exist yet.
 *
 * Returns the SessionUser snapshot the caller feeds straight into the EXISTING
 * session mechanism (`createSession` + `setSessionCookie`) — this function
 * never touches cookies, KV or sessions itself.
 *
 *   created = true  → a brand-new, LOCKED subscriber row was inserted
 *   linked  = true  → an existing row gained its google_id in this call
 */
export async function findOrCreateGoogleUser(
  env: Env,
  identity: VerifiedGoogleIdentity
): Promise<GoogleLoginResult> {
  if (!env.DB) return { ok: false, error: 'AUTH_UNAVAILABLE' }

  const googleId = (identity.googleId || '').trim()
  const email = normalizeEmail(String(identity.email || ''))
  if (!googleId || !email || !isValidEmail(email)) {
    return { ok: false, error: 'INVALID_EMAIL' }
  }

  // Schema safety net (see the header note) — never the migration itself.
  try {
    await ensureGoogleAuthSchema(env)
  } catch (e) {
    console.error('[googleLogin] ensureGoogleAuthSchema failed:', e)
    return { ok: false, error: 'DB_ERROR' }
  }

  // Parity with the password login path: when the Google account IS the
  // configured first-admin, idempotently provision/repair that admin BEFORE we
  // look it up, so the very first production sign-in works with no hardcoded
  // account. No-op for every other address, and a no-op once it matches.
  try {
    if (env.ADMIN_SEED_EMAIL && email === normalizeEmail(String(env.ADMIN_SEED_EMAIL))) {
      await seedAdminFromEnv(env)
    }
  } catch {
    /* Bootstrap is best-effort; a failure must not block a valid sign-in. */
  }

  let created = false
  let linked = false
  let row: GoogleUserRow | null = null

  try {
    // 1. By Google id (stable across email changes).
    row = await findUserByGoogleId(env, googleId)

    // 2. By verified email → LINK the Google id onto the existing account.
    if (!row) {
      const byEmail = await findUserByEmail(env, email)
      if (byEmail) {
        if (!byEmail.googleId) {
          await env.DB.prepare(`UPDATE users SET google_id = ? WHERE id = ?`)
            .bind(googleId, byEmail.id)
            .run()
          linked = true
        }
        // A different google_id already on the row would mean two Google
        // accounts share one verified address, which Google does not allow.
        // We keep the FIRST binding and simply sign the person in.
        row = { ...byEmail, googleId: byEmail.googleId || googleId }
      }
    }

    // 3. Still nothing → create the account (LOCKED subscriber, see header).
    if (!row) {
      const id = generateId()
      try {
        await env.DB.prepare(
          `INSERT INTO users (id, email, email_lower, password_hash, role, status, approved, google_id)
           VALUES (?, ?, ?, ?, 'subscriber', 'active', 0, ?)`
        )
          .bind(id, email, email, GOOGLE_ONLY_PASSWORD_HASH, googleId)
          .run()
        created = true
      } catch (e) {
        // Race with a concurrent callback (UNIQUE email_lower / google_id):
        // re-read instead of failing — whoever won, the account now exists.
        console.error('[googleLogin] INSERT failed (re-reading):', e)
      }

      row =
        (await findUserByGoogleId(env, googleId)) ||
        (await findUserByEmail(env, email))
      if (!row) return { ok: false, error: 'DB_ERROR' }
    }
  } catch (e) {
    console.error('[googleLogin] lookup/creation failed:', e)
    return { ok: false, error: 'DB_ERROR' }
  }

  // Suspension is enforced identically to the password login path.
  if (row.status !== 'active') {
    return { ok: false, error: 'ACCOUNT_SUSPENDED' }
  }

  return { ok: true, user: toSessionUser(row), created, linked }
}

// ---------------------------------------------------------------------------
// Where to send the freshly signed-in user
// ---------------------------------------------------------------------------

/**
 * The app home for a signed-in account, mirroring the destination the existing
 * password form already uses after a successful login
 * (frontend/src/components/AuthShell.tsx): admins land on the console, everyone
 * else on the library. Locked (unapproved) subscribers still go to /library —
 * they browse normally and the untouched approval gate handles file access.
 *
 * Returned as a relative, server-owned path: no user-controlled `next`/`return`
 * parameter is honoured anywhere, so this can never become an open redirect.
 */
export function appHomePathFor(user: SessionUser): string {
  return user.role === 'admin' ? '/admin' : '/library'
}
