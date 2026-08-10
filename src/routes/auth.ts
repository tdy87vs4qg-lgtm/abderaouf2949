// ============================================================================
// تيسير — Auth API routes (SERVER-SIDE)
//
// Endpoints:
//   POST /api/auth/signup   OPEN self-registration (email+password). Creates a
//                           permanent, ACTIVE 'subscriber' that starts LOCKED
//                           (approved = 0), then auto-logs them in. Anyone can
//                           create an account; files stay locked until an admin
//                           approves the account from the dashboard.
//   POST /api/auth/login    verify email+password → persistent session cookie
//   POST /api/auth/logout   invalidate the session server-side + clear cookie
//   GET  /api/auth/me       report the current session (safe, no secrets)
//   GET  /api/auth/google    START of the Google OAuth 2.0 Authorization Code
//                           flow: mints a CSRF `state`, stores it, and 302s the
//                           browser to Google's consent screen.
//   GET  /api/auth/google/callback
//                           RECEIVE half of the flow: PART B-1 validates the
//                           CSRF `state`, exchanges the `code` for tokens and
//                           reads the VERIFIED email + Google id (`sub`); PART
//                           B-2 then looks the user up (or creates them),
//                           issues a session with the EXISTING mechanism and
//                           redirects to the app home.
//
// Robustness: both signup and login call ensureSchema() first, so they work
// even against a deployed D1 whose migrations were never (fully) applied — this
// is the fix for the "signup is broken" report (a missing `approved` column
// used to make every signup fail as a misleading EMAIL_TAKEN).
//
// Security: passwords are verified against a PBKDF2 hash (never stored plain),
// login is rate-limited per IP+email, responses never distinguish "no such
// user" from "wrong password", and no secret ever reaches the client.
// ============================================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import type { Env } from '../lib/drive'
import { verifyPassword } from '../lib/crypto'
import { GOOGLE_ONLY_PASSWORD_HASH } from '../lib/google-users'
import { createSession, destroySession, type SessionUser } from '../lib/session'
import {
  seedAdminFromEnv,
  signupAccount,
  ensureSchema,
  accountErrorResponse,
  normalizeEmail as normalizeAccountEmail,
} from '../lib/users'
import {
  SESSION_COOKIE,
  getSessionSecret,
  getSessionUser,
  setSessionCookie,
  reissueSessionCookie,
  clearSessionCookie,
  ensureDeviceCookie,
} from '../lib/auth'
import {
  buildGoogleAuthUrl,
  generateOAuthState,
  getGoogleOAuthConfig,
  setOAuthStateCookie,
  storeOAuthState,
} from '../lib/google-oauth'
import { resolveGoogleCallbackIdentity } from '../lib/google-oauth-callback'
import { appHomePathFor, findOrCreateGoogleUser } from '../lib/google-users'

export const authApi = new Hono<{ Bindings: Env }>()

// Lock CORS to the site origin (same-origin reflected in dev), credentials on
// so the httpOnly cookie is sent/received.
authApi.use('/*', async (c, next) => {
  const origin = c.env.SITE_ORIGIN
  const mw = cors({
    origin: origin ? [origin] : (o) => o,
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
  return mw(c, next)
})

// ---------------------------------------------------------------------------
// Rate limiting (auth endpoints only) — KV-backed sliding counter.
// Fails OPEN if KV isn't bound (dev), so local login still works.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 8 // attempts
const RATE_LIMIT_WINDOW = 300 // seconds (5 min)

async function rateLimited(c: any, key: string): Promise<boolean> {
  const env = c.env as Env
  if (!env.SESSIONS) return false // no KV in dev → skip
  const k = `ratelimit:auth:${key}`
  const current = Number((await env.SESSIONS.get(k)) || '0')
  if (current >= RATE_LIMIT_MAX) return true
  await env.SESSIONS.put(k, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW })
  return false
}

function clientIp(c: any): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  // Lightweight, non-catastrophic validation. Real proof is that the account
  // exists — we never rely on this for security, only to reject junk early.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Body: { email, password }
// ---------------------------------------------------------------------------
authApi.post('/login', async (c) => {
  let body: { email?: unknown; password?: unknown; fingerprint?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'BAD_REQUEST' }, 400)
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  // Opaque device fingerprint computed by the browser (optional; the server
  // falls back to request headers when absent). Never trusted for anything but
  // device identity — it's hashed with the server secret before storage.
  const fingerprint = body.fingerprint

  // Input validation.
  if (!email || !password || !isValidEmail(email) || password.length > 1024) {
    return c.json({ ok: false, error: 'INVALID_CREDENTIALS' }, 400)
  }

  // Rate limit per IP + email (whichever trips first).
  const ip = clientIp(c)
  if ((await rateLimited(c, ip)) || (await rateLimited(c, email))) {
    return c.json({ ok: false, error: 'RATE_LIMITED' }, 429)
  }

  // Accounts live in D1. Without a DB binding we cannot authenticate anyone
  // (there is no self-signup and no in-memory users) → deny cleanly.
  if (!c.env.DB) {
    return c.json({ ok: false, error: 'AUTH_UNAVAILABLE' }, 503)
  }

  // Self-heal the schema so login works even against a deployed DB whose
  // migrations were never (fully) applied — including the `approved` column
  // this SELECT reads below.
  try {
    await ensureSchema(c.env)
  } catch {
    return c.json({ ok: false, error: 'AUTH_UNAVAILABLE' }, 503)
  }

  // First-admin bootstrap: when the submitted email matches the configured
  // ADMIN_SEED_EMAIL secret, idempotently provision (or repair) the seed admin
  // BEFORE we look it up, so the very first production login with the seed
  // credentials succeeds without any hardcoded account. This is a no-op once
  // the admin exists and already matches, and never runs for other emails.
  if (
    c.env.ADMIN_SEED_EMAIL &&
    email === normalizeAccountEmail(c.env.ADMIN_SEED_EMAIL)
  ) {
    await seedAdminFromEnv(c.env)
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, password_hash AS passwordHash, role, status, approved
       FROM users WHERE email_lower = ?`
  )
    .bind(email)
    .first<{
      id: string
      email: string
      passwordHash: string
      role: 'subscriber' | 'admin'
      status: 'active' | 'suspended'
      approved: number
    }>()

  // Uniform failure: never reveal whether the email exists. We still run a
  // verify against a dummy hash to keep timing roughly constant.
  const storedHash =
    row?.passwordHash ||
    'pbkdf2$SHA-256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  const passwordOk = await verifyPassword(password, storedHash)

  // ── PART B-2: password login is DISABLED for Google-only accounts ─────────
  // An account created through "Sign in with Google" has no password: its
  // `password_hash` holds the deliberately unusable placeholder
  // GOOGLE_ONLY_PASSWORD_HASH (see src/lib/google-users.ts). That value is not
  // in the `pbkdf2$…` format, so verifyPassword() already returns false for it
  // and this route ALREADY refuses such logins — the explicit check below just
  // makes the intent unmistakable and guards against any future change to the
  // hash format. The refusal is folded into the SAME uniform
  // INVALID_CREDENTIALS answer, so we never reveal that the address exists or
  // that it is a Google-only account. Password accounts are completely
  // unaffected: this route, its rate limiting, its admin bootstrap and its
  // session issuing are otherwise untouched.
  const isGoogleOnlyAccount = row?.passwordHash === GOOGLE_ONLY_PASSWORD_HASH

  if (!row || !passwordOk || isGoogleOnlyAccount) {
    return c.json({ ok: false, error: 'INVALID_CREDENTIALS' }, 401)
  }
  if (row.status !== 'active') {
    return c.json({ ok: false, error: 'ACCOUNT_SUSPENDED' }, 403)
  }

  // ── Single-device lock: REMOVED ──────────────────────────────────────────
  // The former "one allowed device per account" check ran here and could deny
  // login with DEVICE_BLOCKED (recording a pending admin-approval request).
  // That lock has been removed: a correct password on an active account is now
  // sufficient, from ANY device. `fingerprint` is still accepted in the request
  // body (the frontend is unchanged in this step) but is simply ignored.
  void fingerprint

  // Success → mint a persistent session.
  const user: SessionUser = {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    approved: !!row.approved,
  }
  const secret = getSessionSecret(c.env)
  const { token, expiresAt } = await createSession(c.env, user, secret)
  setSessionCookie(c, token, expiresAt)

  return c.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, approved: user.approved },
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/signup — OPEN self-registration
// Body: { email, password }
//
// Anyone can create their own account (email + password). The account is
// created immediately and PERMANENTLY as an active 'subscriber', but it starts
// LOCKED (approved = 0): the user can sign in and browse everything, yet every
// file stays locked behind the contact popup until an admin approves them.
// On success we sign the user straight in (persistent session) so they land in
// the library right away — locked, but browsing.
// ---------------------------------------------------------------------------
authApi.post('/signup', async (c) => {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'BAD_REQUEST' }, 400)
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !isValidEmail(email)) {
    return c.json({ ok: false, error: 'INVALID_EMAIL', message: 'A valid email address is required.' }, 400)
  }
  if (!password || password.length < 8 || password.length > 1024) {
    return c.json({ ok: false, error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' }, 400)
  }

  // Rate limit signup per IP + email to deter abuse.
  const ip = clientIp(c)
  if ((await rateLimited(c, 'signup:' + ip)) || (await rateLimited(c, 'signup:' + email))) {
    return c.json({ ok: false, error: 'RATE_LIMITED' }, 429)
  }

  if (!c.env.DB) {
    return c.json({ ok: false, error: 'AUTH_UNAVAILABLE' }, 503)
  }

  const result = await signupAccount(c.env, email, password)
  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    // Email uniqueness is enforced BEFORE the account is created (explicit
    // lookup + UNIQUE(email_lower) constraint as a race backstop — see
    // src/lib/users.ts → createAccount). Surface the taken-email case with a
    // clear Arabic message so the signup UI always shows it, even if the
    // client-side code→message map ever misses this code.
    const arabicMessage =
      result.error === 'EMAIL_TAKEN'
        ? 'هذا البريد الإلكتروني مستعمل من قبل.'
        : message
    return c.json({ ok: false, error: result.error, message: arabicMessage }, status)
  }

  // Auto-login the freshly-created (locked) account so they land in the library.
  const user: SessionUser = {
    id: result.account.id,
    email: result.account.email,
    role: result.account.role,
    status: result.account.status,
    approved: result.account.approved,
  }
  const secret = getSessionSecret(c.env)
  const { token, expiresAt } = await createSession(c.env, user, secret)
  setSessionCookie(c, token, expiresAt)

  return c.json(
    {
      ok: true,
      user: { id: user.id, email: user.email, role: user.role, approved: user.approved },
    },
    201
  )
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout — invalidate server-side, then clear the cookie.
// ---------------------------------------------------------------------------
authApi.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  const secret = getSessionSecret(c.env)
  await destroySession(c.env, token, secret)
  clearSessionCookie(c)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// GET /api/auth/me — current session snapshot (booleans + safe fields only).
//
// Also silently renews the session server-side (via getSessionUser) AND slides
// the client cookie forward: whenever a LIVE session is confirmed we re-issue
// Set-Cookie with a fresh ~1yr Expires/Max-Age so the cookie's absolute expiry
// tracks active use instead of being frozen at login time. This is the cookie
// half of the sliding session and is what keeps lifetime-trimming browsers
// (iOS Safari et al.) from silently losing the session on return. We also
// re-issue the durable device-id cookie so its lifetime slides forward too.
//
// Re-issue happens ONLY on a confirmed valid session — never on an invalid one.
// ---------------------------------------------------------------------------
authApi.get('/me', async (c) => {
  const user = await getSessionUser(c)
  if (!user) {
    return c.json({ ok: true, authenticated: false })
  }

  // Slide the cookies forward on active use (valid session confirmed above).
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    reissueSessionCookie(c, token)
    // Keep the durable device-id cookie alive for the same window. This is NOT
    // a device re-evaluation (binding is a login-time concern only) — it merely
    // refreshes the existing cookie's lifetime so the device identity stays
    // stable for the returning user.
    ensureDeviceCookie(c)
  }

  return c.json({
    ok: true,
    authenticated: true,
    user: { id: user.id, email: user.email, role: user.role, approved: user.approved },
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/google — START of the Google OAuth 2.0 Authorization Code flow
//
// PART A ONLY. This route does exactly three things:
//   1. Read GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_REDIRECT_URI from env
//      (src/lib/google-oauth.ts → getGoogleOAuthConfig). Never hardcoded,
//      never logged. Missing/invalid config → 503 OAUTH_NOT_CONFIGURED.
//   2. Mint a random CSRF `state` and persist it so the Part B callback can
//      validate it:
//        • httpOnly `bac_oauth_state` cookie (AUTHORITATIVE, 10 min,
//          SameSite=Lax so it rides Google's top-level GET back to us);
//        • plus a best-effort KV record `oauth:state:<state>` = '1' with a
//          10-min TTL when the SESSIONS namespace is bound (replay protection).
//      Full contract is documented at the top of src/lib/google-oauth.ts.
//   3. 302-redirect the browser to Google's consent screen with
//      response_type=code and scope `openid email profile`.
//
// It does NOT exchange the code, look up/create any user, or issue a session —
// that is Part B. It also does not read, write or invalidate the session cookie
// (`bac_session`), the device cookie, or any D1 row: an already-signed-in
// visitor is unaffected. GET (not POST) because it must be reachable by a plain
// top-level navigation from a link/button.
// ---------------------------------------------------------------------------
authApi.get('/google', async (c) => {
  const config = getGoogleOAuthConfig(c.env)
  if (!config) {
    // Deliberately generic: we never echo which binding is missing, and never
    // log the values themselves.
    return c.json({ ok: false, error: 'OAUTH_NOT_CONFIGURED' }, 503)
  }

  const state = generateOAuthState()
  // Cookie first (authoritative), then the optional KV record.
  setOAuthStateCookie(c, state)
  await storeOAuthState(c.env, state)

  // 302 so the browser follows it as a normal navigation to Google.
  return c.redirect(buildGoogleAuthUrl(config, state), 302)
})

// ---------------------------------------------------------------------------
// GET /api/auth/google/callback — RECEIVE half of the flow (PART B-1 + B-2)
//
// Google sends the browser here as a top-level GET after the consent screen,
// with `?code=…&state=…` (or `?error=…` when the user declined). Everything the
// receive half does lives in src/lib/google-oauth-callback.ts →
// resolveGoogleCallbackIdentity(c), which performs, in order:
//
//   1. read GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET +
//      GOOGLE_OAUTH_REDIRECT_URI from env (never hardcoded, never logged);
//   2. validate `state` against the authoritative httpOnly `bac_oauth_state`
//      cookie using the constant-time comparator from src/lib/crypto.ts, then
//      burn the optional KV record `oauth:state:<state>` (replay protection);
//   3. POST the `code` to Google's token endpoint with client_id +
//      client_secret + redirect_uri (confidential-client Authorization Code
//      grant). The secret goes ONLY into that server-side request body;
//   4. read the VERIFIED email and the Google id (`sub`) from the returned
//      id_token (aud/iss/exp checked), falling back to the OIDC userinfo
//      endpoint. An unverified email is refused.
//
// The `bac_oauth_state` cookie is cleared on EVERY exit path (success and
// failure) inside that helper. GET — because it must be reachable by Google's
// plain top-level navigation.
//
// ── PART B-2: FINISHING THE LOGIN ──────────────────────────────────────────
// Steps 1–4 above are UNCHANGED. What B-2 adds is only what happens with the
// in-process `result.identity` ({ googleId, email, emailVerified, name?,
// picture? }) on the success branch:
//
//   5. src/lib/google-users.ts → findOrCreateGoogleUser(env, identity):
//        • look the account up by `google_id` (Google's stable `sub`);
//        • else by `email_lower` → LINK `google_id` onto that existing row
//          (no duplicate account for someone who signed up with a password);
//        • else CREATE an active 'subscriber' that starts LOCKED
//          (approved = 0), exactly like open self-signup, so Google sign-in
//          grants a SESSION and never entitlement;
//        • a 'suspended' account is refused, same as the password path.
//   6. Issue the session with the EXISTING, UNMODIFIED mechanism — the very
//      same two calls POST /login and POST /signup above already make:
//          createSession(c.env, user, getSessionSecret(c.env))
//          setSessionCookie(c, token, expiresAt)
//      Nothing about how the cookie is issued or persisted is changed here.
//   7. 302-redirect to the app home (/library, or /admin for an admin) — the
//      same destination the existing password form navigates to. The target is
//      computed server-side from the account's role; no user-supplied `next`
//      parameter is honoured, so this can never become an open redirect.
//
// UNTOUCHED BY THIS ROUTE: the session cookie MECHANISM itself and its KV/D1
// store (reused verbatim), the device cookie, the subscription/approval gate,
// Drive, the PDF viewer guard, the IndexedDB cache and every piece of Arabic UI
// copy. There are no frontend changes: the browser simply lands on /library.
// ---------------------------------------------------------------------------
authApi.get('/google/callback', async (c) => {
  const result = await resolveGoogleCallbackIdentity(c)

  if (!result.ok) {
    // Stable, non-sensitive codes only: they never disclose which env binding
    // is missing, what Google replied, or whether an account exists.
    //   OAUTH_NOT_CONFIGURED       503  bindings missing/invalid
    //   OAUTH_DENIED               400  user declined at Google
    //   OAUTH_BAD_REQUEST          400  code/state missing or malformed
    //   OAUTH_STATE_INVALID        400  CSRF mismatch / expired / replayed
    //   OAUTH_EXCHANGE_FAILED      502  Google refused the code→token exchange
    //   OAUTH_IDENTITY_UNAVAILABLE 502  no usable sub/email came back
    //   OAUTH_EMAIL_UNVERIFIED     403  Google says the email is not verified
    return c.json({ ok: false, error: result.error }, result.status)
  }

  // ===== PART B-2: user lookup / creation → session → redirect ===============

  // 5. Resolve the verified identity to a D1 account (found, linked, or newly
  //    created as a LOCKED active subscriber). No cookies/KV/Drive touched.
  const lookup = await findOrCreateGoogleUser(c.env, result.identity)
  if (!lookup.ok) {
    //   AUTH_UNAVAILABLE   503  no D1 binding / schema unusable
    //   INVALID_EMAIL      400  defensive — the email failed normalisation
    //   ACCOUNT_SUSPENDED  403  same refusal as the password login path
    //   DB_ERROR           503  a D1 read/write failed
    const status =
      lookup.error === 'ACCOUNT_SUSPENDED'
        ? 403
        : lookup.error === 'INVALID_EMAIL'
          ? 400
          : 503
    return c.json({ ok: false, error: lookup.error }, status)
  }

  // 6. Issue the session with the EXISTING mechanism — byte-for-byte the same
  //    two calls the password login/signup handlers above use. Nothing about
  //    how the cookie is minted, stored (KV + D1) or persisted changes here.
  const secret = getSessionSecret(c.env)
  const { token, expiresAt } = await createSession(c.env, lookup.user, secret)
  setSessionCookie(c, token, expiresAt)

  // 7. Land the user in the app. 302 so the browser follows it as the normal
  //    continuation of Google's top-level navigation, carrying the Set-Cookie
  //    we just wrote. The path is derived server-side from the account's role
  //    (never from a query parameter) → no open-redirect surface.
  return c.redirect(appHomePathFor(lookup.user), 302)
  // ===========================================================================
})
