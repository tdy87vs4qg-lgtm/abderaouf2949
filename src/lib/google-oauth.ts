// ============================================================================
// تيسير — Google OAuth 2.0 "Sign in with Google" helpers (SERVER-SIDE ONLY)
//
// PART A (this file) covers ONLY the *start* half of the Authorization Code
// flow: build Google's consent-screen URL and remember a CSRF `state` value so
// the callback can validate it. The callback itself (code→token exchange, user
// lookup/creation, session issuing) is PART B and is deliberately NOT here.
//
// ⚠️  These credentials are the OAuth 2.0 **Client ID** credentials — a totally
//     different thing from the Drive **Service Account** key handled in
//     src/lib/google-auth.ts. Nothing in this file touches Drive.
//
// ENVIRONMENT (read from env bindings ONLY — never hardcoded, never logged,
// never sent to the browser except where Google's own spec requires it):
//   • GOOGLE_OAUTH_CLIENT_ID     — the OAuth 2.0 Client ID. It is a PUBLIC
//     identifier by design: Google's spec puts it in the authorization URL, so
//     it necessarily appears in the redirect we issue. It is still read from env
//     only so it is never baked into the repo.
//   • GOOGLE_OAUTH_REDIRECT_URI  — the exact redirect/callback URI registered on
//     the Google Cloud OAuth client. Must match byte-for-byte or Google rejects
//     the request with redirect_uri_mismatch. Read from env only; there is NO
//     hardcoded fallback on purpose, so a misconfiguration fails loudly instead
//     of silently pointing at the wrong host.
//   • The OAuth **client secret** is NOT read here at all: the start leg never
//     needs it. Part B (the token exchange) will read its own env binding.
//
// RUNTIME: Cloudflare Workers only — Web Crypto + fetch, no Node-only APIs.
//
// ---------------------------------------------------------------------------
// HOW THE CSRF `state` IS STORED  (contract for PART B — read this first)
// ---------------------------------------------------------------------------
// The start route generates a cryptographically-random, URL-safe `state` and
// persists it in TWO places. The COOKIE is the source of truth; the KV record is
// an optional hardening layer:
//
//  1. COOKIE (authoritative, always written)
//       name    : `bac_oauth_state`   (exported as OAUTH_STATE_COOKIE)
//       value   : the raw `state` string, verbatim (no signing/encoding)
//       flags   : httpOnly, SameSite=Lax, Path=/, Secure on https
//                 (SameSite=Lax is REQUIRED — the callback arrives as a
//                  top-level GET navigation from accounts.google.com, and Lax
//                  cookies are sent on exactly that.)
//       lifetime: OAUTH_STATE_TTL_SECONDS (600s / 10 min), Max-Age + Expires
//     Part B must compare the `state` query parameter against this cookie with a
//     constant-time equality check, then DELETE the cookie
//     (clearOAuthStateCookie) whether validation passed or failed.
//
//  2. KV (optional, best-effort — only when the `SESSIONS` KV namespace is
//     bound; skipped silently in local dev where it usually is not)
//       key       : `oauth:state:<state>`   (see oauthStateKvKey)
//       value     : `'1'`
//       expiration: expirationTtl = OAUTH_STATE_TTL_SECONDS
//     Part B may call consumeOAuthState() to burn the record, which gives
//     single-use/replay protection. It returns `true` when KV is absent so the
//     flow keeps working without KV (cookie check still applies).
//
// Nothing else in the app reads or writes this cookie or key prefix, so the
// session cookie (`bac_session`), the device cookie (`bac_device`) and the KV
// session cache are completely untouched by the OAuth flow.
// ============================================================================

import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Env } from './drive'
import { generateToken } from './crypto'
import { isSecureRequest } from './auth'

/** Google's OAuth 2.0 authorization (consent screen) endpoint. */
export const GOOGLE_OAUTH_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

/**
 * Scopes requested on the consent screen: identity only.
 * `openid email profile` yields an id_token with the user's email + basic
 * profile — everything Part B needs to look up / create the account. No Drive,
 * no offline access, no write scope of any kind.
 */
export const GOOGLE_OAUTH_SCOPES = 'openid email profile'

/** Name of the short-lived CSRF `state` cookie (httpOnly, SameSite=Lax). */
export const OAUTH_STATE_COOKIE = 'bac_oauth_state'

/** Lifetime of the `state` (cookie Max-Age/Expires + KV expirationTtl): 10 min. */
export const OAUTH_STATE_TTL_SECONDS = 600

/** Resolved OAuth start-leg configuration, read from env bindings only. */
export interface GoogleOAuthConfig {
  clientId: string
  redirectUri: string
}

/**
 * Read + validate the OAuth start-leg configuration from the environment.
 * Returns null when either binding is missing/blank, or when the redirect URI is
 * not a syntactically valid absolute URL. There is NO fallback value: callers
 * must surface a clean "not configured" error rather than guess.
 */
export function getGoogleOAuthConfig(env: Env): GoogleOAuthConfig | null {
  const clientId = (env.GOOGLE_OAUTH_CLIENT_ID || '').trim()
  const redirectUri = (env.GOOGLE_OAUTH_REDIRECT_URI || '').trim()
  if (!clientId || !redirectUri) return null
  try {
    // Must be an absolute URL — Google rejects anything else, and failing here
    // gives a clear config error instead of a confusing Google error page.
    new URL(redirectUri)
  } catch {
    return null
  }
  return { clientId, redirectUri }
}

/**
 * Fresh, opaque, URL-safe CSRF state (256 bits of Web Crypto randomness).
 * Reuses the same generator as session tokens so there is one source of
 * randomness in the codebase.
 */
export function generateOAuthState(): string {
  return generateToken()
}

/**
 * Build the Google consent-screen URL for the Authorization Code flow.
 *
 * Parameters (all per Google's OAuth 2.0 spec):
 *   client_id      — from env
 *   redirect_uri   — from env (must match the registered URI exactly)
 *   response_type  — `code` (Authorization Code flow; Part B exchanges it)
 *   scope          — `openid email profile`
 *   state          — CSRF token, validated by Part B
 *   access_type    — `online` (no refresh token; we only need identity once)
 *   prompt         — `select_account` so a shared browser can pick an account
 *   include_granted_scopes — `true`, standard incremental-auth hygiene
 */
export function buildGoogleAuthUrl(
  config: GoogleOAuthConfig,
  state: string
): string {
  const url = new URL(GOOGLE_OAUTH_AUTH_ENDPOINT)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

// ---------------------------------------------------------------------------
// CSRF state persistence — cookie (authoritative) + KV (optional hardening)
// ---------------------------------------------------------------------------

/** KV key under which a pending `state` is recorded. */
export function oauthStateKvKey(state: string): string {
  return `oauth:state:${state}`
}

/**
 * Write the short-lived `state` cookie. httpOnly (page JS can neither read nor
 * forge it), SameSite=Lax (so it IS sent on the top-level GET navigation Google
 * makes back to the callback), Secure whenever the request is https — detected
 * with the same proxy-aware helper the session cookie uses, so local http dev
 * still works.
 */
export function setOAuthStateCookie(
  c: Context<{ Bindings: Env }>,
  state: string
): void {
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS,
    expires: new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000),
  })
}

/** Read the pending `state` from the cookie (used by Part B's callback). */
export function readOAuthStateCookie(
  c: Context<{ Bindings: Env }>
): string | undefined {
  const v = getCookie(c, OAUTH_STATE_COOKIE)
  return v && v.length >= 16 ? v : undefined
}

/**
 * Delete the `state` cookie. Part B must call this on BOTH the success and the
 * failure path so a state value can never be replayed.
 */
export function clearOAuthStateCookie(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' })
}

/**
 * Best-effort KV record of a pending `state` (single-use/replay protection).
 * No-op when the SESSIONS KV namespace isn't bound (typical in local dev) and
 * swallows KV errors — the cookie remains the authoritative CSRF check, so the
 * flow must never break because KV is unavailable.
 */
export async function storeOAuthState(env: Env, state: string): Promise<void> {
  if (!env.SESSIONS) return
  try {
    await env.SESSIONS.put(oauthStateKvKey(state), '1', {
      expirationTtl: OAUTH_STATE_TTL_SECONDS,
    })
  } catch {
    /* KV is an optimisation only — ignore failures */
  }
}

/**
 * PART B helper (exported now so the contract is fixed): atomically "burn" a
 * pending `state`. Returns true when the state was present (or when KV isn't
 * bound, i.e. nothing to check), false when KV is bound but has no such record
 * — meaning the state expired or is being replayed.
 */
export async function consumeOAuthState(env: Env, state: string): Promise<boolean> {
  if (!env.SESSIONS) return true // no KV → cookie check is the only gate
  const key = oauthStateKvKey(state)
  try {
    const found = await env.SESSIONS.get(key)
    if (!found) return false
    await env.SESSIONS.delete(key)
    return true
  } catch {
    return true // KV failure must not block a request whose cookie matched
  }
}
