// ============================================================================
// تيسير — Google OAuth 2.0 callback: RECEIVE half  (PART B-1, SERVER-SIDE ONLY)
//
// This module is the second leg of the Authorization Code flow started in
// src/lib/google-oauth.ts (PART A). It covers EXACTLY four things and stops:
//
//   1. validate the CSRF `state` that comes back from Google against the
//      authoritative `bac_oauth_state` cookie, in constant time, and burn the
//      optional KV record so a `state` can never be replayed;
//   2. exchange the one-time `code` for tokens at Google's token endpoint
//      (client_id + client_secret + redirect_uri — the confidential-client
//      Authorization Code grant);
//   3. read the account's VERIFIED email and stable Google id (`sub`) out of
//      the returned `id_token` (with the OIDC userinfo endpoint as a fallback);
//   4. hand that verified identity back to the caller as a plain object.
//
// It DELIBERATELY does NOT:
//   • look up or create any user row in D1,
//   • touch the session cookie (`bac_session`), the session KV cache, the
//     device cookie, the subscription/approval gate, or Drive in any way,
//   • issue, renew or destroy a session.
//   Those belong to PART B-2. See "HANDOFF TO PART B-2" below.
//
// ⚠️  Credentials used here are the OAuth 2.0 **Client ID** credentials — a
//     completely different credential from the Drive **Service Account** key in
//     src/lib/google-auth.ts. Nothing here touches Drive.
//
// ENVIRONMENT (read from env bindings ONLY — never hardcoded, never logged,
// never returned to the browser):
//   • GOOGLE_OAUTH_CLIENT_ID      — public by design (Google puts it in the
//                                   authorization URL). Also used as the
//                                   expected `aud` of the id_token.
//   • GOOGLE_OAUTH_CLIENT_SECRET  — TRUE SECRET. Sent only in the server→server
//                                   POST body to Google's token endpoint over
//                                   TLS. Never logged, never echoed, never part
//                                   of any response or error message.
//   • GOOGLE_OAUTH_REDIRECT_URI   — must match the URI registered on the OAuth
//                                   client byte-for-byte; Google re-checks it
//                                   during the exchange.
//
// RUNTIME: Cloudflare Workers only — `fetch` + Web Crypto, no Node APIs.
//
// ---------------------------------------------------------------------------
// WHY THE id_token SIGNATURE IS NOT VERIFIED HERE
// ---------------------------------------------------------------------------
// Per Google's OpenID Connect guidance, an id_token obtained *directly* from
// Google's token endpoint over a TLS-authenticated, server-to-server POST does
// not need local signature verification: the transport already proves the
// issuer. (Signature checks are required only for tokens received from
// untrusted channels, e.g. straight from the browser.) We still validate the
// claims that matter — `aud` must equal our own client id, `iss` must be
// Google, `exp` must be in the future, `email_verified` must be true — so a
// token minted for another client can never be accepted.
//
// ---------------------------------------------------------------------------
// HANDOFF TO PART B-2  (read this before writing B-2)
// ---------------------------------------------------------------------------
// The handoff is IN-PROCESS, inside the single callback request. Nothing is
// persisted: no KV record, no D1 row, no cookie carries the identity — which is
// the safest possible contract, since the verified email never leaves the
// isolate that received it.
//
//   `resolveGoogleCallbackIdentity(c)` returns a discriminated union:
//
//     { ok: true,  identity: VerifiedGoogleIdentity }
//     { ok: false, error: GoogleCallbackErrorCode, status: number }
//
//   VerifiedGoogleIdentity = {
//     googleId: string        // the id_token/userinfo `sub` — stable, never reused
//     email: string           // lower-cased, trimmed, VERIFIED
//     emailVerified: true      // always true; unverified logins are rejected earlier
//     name?: string            // optional profile extras, unused by B-1
//     picture?: string
//   }
//
// PART B-2 therefore changes EXACTLY ONE place: the placeholder block at the
// end of `GET /api/auth/google/callback` in src/routes/auth.ts (the block
// marked `PART B-1 STOPS HERE`). It replaces the temporary
// `{ ok: true, pending: 'B2', ... }` JSON with: look up / create the user by
// `identity.email` (linking `identity.googleId`), then `createSession(...)` +
// `setSessionCookie(...)` and redirect. Everything above that block —
// validation, exchange, identity read, error handling — stays untouched.
// ============================================================================

import type { Context } from 'hono'
import type { Env } from './drive'
import { timingSafeEqual } from './crypto'
import {
  clearOAuthStateCookie,
  consumeOAuthState,
  getGoogleOAuthConfig,
  readOAuthStateCookie,
} from './google-oauth'

/** Google's OAuth 2.0 token endpoint (code → tokens). */
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** OIDC userinfo endpoint — fallback identity source when no id_token arrives. */
export const GOOGLE_OAUTH_USERINFO_ENDPOINT =
  'https://openidconnect.googleapis.com/v1/userinfo'

/** Accepted `iss` values for a Google-issued id_token. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/** Clock-skew tolerance (seconds) when checking the id_token `exp`. */
const ID_TOKEN_SKEW_SECONDS = 120

/** Hard ceiling on how long we wait for Google (keeps the request bounded). */
const GOOGLE_FETCH_TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A Google account whose email Google itself reports as verified.
 * This is the ONLY thing Part B-1 produces, and the ONLY input Part B-2 needs.
 */
export interface VerifiedGoogleIdentity {
  /** The `sub` claim: Google's stable, never-reused account id. */
  googleId: string
  /** Verified email address, trimmed + lower-cased. */
  email: string
  /** Always true — an unverified email is rejected before this object exists. */
  emailVerified: true
  /** Optional profile extras. Unused by B-1; B-2 may store them if it wants. */
  name?: string
  picture?: string
}

/**
 * Stable, non-sensitive error codes. These are safe to return to the browser:
 * none of them reveals which env binding is missing, what Google replied, or
 * whether a given email/account exists.
 */
export type GoogleCallbackErrorCode =
  /** GOOGLE_OAUTH_* bindings missing/invalid (incl. the client secret). */
  | 'OAUTH_NOT_CONFIGURED'
  /** Google itself reported a failure in the query (e.g. `access_denied`). */
  | 'OAUTH_DENIED'
  /** `code` and/or `state` query parameter absent or malformed. */
  | 'OAUTH_BAD_REQUEST'
  /** State cookie missing/expired, mismatched, or already burned (replay). */
  | 'OAUTH_STATE_INVALID'
  /** Google refused the code→token exchange, or returned an unusable body. */
  | 'OAUTH_EXCHANGE_FAILED'
  /** Exchange succeeded but no usable `sub`/email could be read. */
  | 'OAUTH_IDENTITY_UNAVAILABLE'
  /** Google says the account's email is not verified — we refuse those. */
  | 'OAUTH_EMAIL_UNVERIFIED'

export type GoogleCallbackResult =
  | { ok: true; identity: VerifiedGoogleIdentity }
  | { ok: false; error: GoogleCallbackErrorCode; status: 400 | 403 | 502 | 503 }

/** Full (confidential-client) OAuth config: adds the secret to Part A's pair. */
export interface GoogleOAuthExchangeConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Read the FULL exchange configuration from env: Part A's client id + redirect
 * URI (via getGoogleOAuthConfig, reused verbatim so both legs can never drift)
 * plus the client secret this leg needs.
 *
 * Returns null when anything is missing/blank so callers answer a generic
 * "not configured" — we never disclose *which* binding is absent.
 */
export function getGoogleOAuthExchangeConfig(
  env: Env
): GoogleOAuthExchangeConfig | null {
  const base = getGoogleOAuthConfig(env)
  if (!base) return null
  const clientSecret = (env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim()
  if (!clientSecret) return null
  return {
    clientId: base.clientId,
    clientSecret,
    redirectUri: base.redirectUri,
  }
}

// ---------------------------------------------------------------------------
// 1. CSRF `state` validation
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison built on crypto.ts → timingSafeEqual.
 * Encoding both sides to UTF-8 bytes first is what lets us reuse the single
 * audited constant-time primitive instead of writing a second one.
 *
 * (Like every constant-time comparator, an unequal LENGTH short-circuits. That
 * leaks nothing useful here: `state` is a fixed-width random token.)
 */
function statesMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  return timingSafeEqual(enc.encode(a), enc.encode(b))
}

/**
 * Validate the `state` returned by Google.
 *
 * Two independent gates:
 *   • COOKIE (authoritative) — `bac_oauth_state`, compared in constant time.
 *     A missing/expired cookie fails closed.
 *   • KV (hardening, optional) — `consumeOAuthState` burns `oauth:state:<state>`
 *     so the same state can never be used twice. It returns true when the
 *     SESSIONS namespace isn't bound (local dev), keeping the cookie as the
 *     single gate there.
 *
 * The `bac_oauth_state` cookie is cleared unconditionally by the CALLER before
 * this returns to the browser — on the success path and on every failure path
 * alike (see resolveGoogleCallbackIdentity). Only this cookie is touched; the
 * session and device cookies are never read or written here.
 */
export async function validateOAuthStateParam(
  c: Context<{ Bindings: Env }>,
  state: string
): Promise<boolean> {
  const expected = readOAuthStateCookie(c)
  if (!expected) return false
  if (!statesMatch(state, expected)) return false
  // Cookie matched → burn the KV record (replay protection).
  return consumeOAuthState(c.env, state)
}

// ---------------------------------------------------------------------------
// 2. Authorization code → tokens
// ---------------------------------------------------------------------------

/** The only fields of Google's token response this leg cares about. */
interface GoogleTokenResponse {
  access_token?: string
  id_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

/**
 * Exchange the one-time authorization `code` for tokens.
 *
 * POST application/x-www-form-urlencoded to Google's token endpoint with
 * grant_type=authorization_code + code + client_id + client_secret +
 * redirect_uri, exactly as the confidential-client Authorization Code grant
 * prescribes. The secret travels only in this server-side request body.
 *
 * Returns null on ANY failure (non-2xx, network error, timeout, unparsable
 * body). Google's error text is intentionally discarded rather than logged or
 * surfaced: it can echo request parameters back.
 */
export async function exchangeCodeForTokens(
  config: GoogleOAuthExchangeConfig,
  code: string
): Promise<GoogleTokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  })

  let res: Response
  try {
    res = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    })
  } catch {
    return null // network error / timeout — nothing sensitive to report
  }

  if (!res.ok) {
    // Drain so the connection can be reused, then drop the body entirely.
    try {
      await res.text()
    } catch {
      /* ignore */
    }
    return null
  }

  try {
    const json = (await res.json()) as GoogleTokenResponse
    if (!json || typeof json !== 'object') return null
    if (!json.id_token && !json.access_token) return null
    return json
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 3. Reading the verified identity
// ---------------------------------------------------------------------------

/** Claims we read out of Google's id_token. */
interface GoogleIdTokenClaims {
  iss?: string
  aud?: string | string[]
  sub?: string
  exp?: number
  email?: string
  email_verified?: boolean | string
  name?: string
  picture?: string
}

/** Decode unpadded base64url → UTF-8 string (atob + TextDecoder, no Buffer). */
function decodeBase64Url(segment: string): string | null {
  try {
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/**
 * Decode (NOT signature-verify — see the header note) the id_token payload and
 * check the claims that carry security meaning:
 *   • `iss` is Google,
 *   • `aud` is OUR client id (so a token minted for another app is rejected),
 *   • `exp` is still in the future (small skew allowed).
 * Returns null when the token is malformed or any check fails.
 */
export function decodeGoogleIdToken(
  idToken: string,
  expectedClientId: string
): GoogleIdTokenClaims | null {
  const parts = idToken.split('.')
  if (parts.length !== 3) return null

  const payloadJson = decodeBase64Url(parts[1])
  if (!payloadJson) return null

  let claims: GoogleIdTokenClaims
  try {
    claims = JSON.parse(payloadJson) as GoogleIdTokenClaims
  } catch {
    return null
  }
  if (!claims || typeof claims !== 'object') return null

  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) return null

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.some((a) => typeof a === 'string' && a === expectedClientId)) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + ID_TOKEN_SKEW_SECONDS <= now) {
    return null
  }

  return claims
}

/** Shape of the OIDC userinfo response (fallback identity source). */
interface GoogleUserInfo {
  sub?: string
  email?: string
  email_verified?: boolean | string
  name?: string
  picture?: string
}

/**
 * Fallback: read the identity from the OIDC userinfo endpoint with the access
 * token. Only used when the token response carried no usable id_token. Returns
 * null on any failure (never throws, never logs the token).
 */
export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo | null> {
  try {
    const res = await fetch(GOOGLE_OAUTH_USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      try {
        await res.text()
      } catch {
        /* ignore */
      }
      return null
    }
    const json = (await res.json()) as GoogleUserInfo
    return json && typeof json === 'object' ? json : null
  } catch {
    return null
  }
}

/** Google reports email_verified as a boolean or the string "true". */
function isEmailVerified(value: boolean | string | undefined): boolean {
  return value === true || value === 'true'
}

/** Cheap sanity check — the real proof of validity is Google's own assertion. */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

/**
 * Turn a token response into a VerifiedGoogleIdentity.
 *
 * Order of preference: the id_token claims (already validated), then userinfo.
 * The email is trimmed + lower-cased so it matches the app's existing
 * `email_lower` normalisation, which is what Part B-2 will look accounts up by.
 *
 * Returns a discriminated failure so the route can distinguish "couldn't read
 * an identity at all" from "identity read, but the email is unverified".
 */
export async function readVerifiedIdentity(
  tokens: GoogleTokenResponse,
  expectedClientId: string
): Promise<
  | { ok: true; identity: VerifiedGoogleIdentity }
  | { ok: false; error: 'OAUTH_IDENTITY_UNAVAILABLE' | 'OAUTH_EMAIL_UNVERIFIED' }
> {
  let sub: string | undefined
  let email: string | undefined
  let verified = false
  let name: string | undefined
  let picture: string | undefined

  if (tokens.id_token) {
    const claims = decodeGoogleIdToken(tokens.id_token, expectedClientId)
    if (claims) {
      sub = typeof claims.sub === 'string' ? claims.sub : undefined
      email = typeof claims.email === 'string' ? claims.email : undefined
      verified = isEmailVerified(claims.email_verified)
      name = typeof claims.name === 'string' ? claims.name : undefined
      picture = typeof claims.picture === 'string' ? claims.picture : undefined
    }
  }

  // No (usable) id_token → ask userinfo with the access token.
  if ((!sub || !email) && tokens.access_token) {
    const info = await fetchGoogleUserInfo(tokens.access_token)
    if (info) {
      sub = sub || (typeof info.sub === 'string' ? info.sub : undefined)
      if (!email && typeof info.email === 'string') {
        email = info.email
        verified = isEmailVerified(info.email_verified)
      }
      name = name || (typeof info.name === 'string' ? info.name : undefined)
      picture = picture || (typeof info.picture === 'string' ? info.picture : undefined)
    }
  }

  const normalizedEmail = (email || '').trim().toLowerCase()
  if (!sub || !normalizedEmail || !looksLikeEmail(normalizedEmail)) {
    return { ok: false, error: 'OAUTH_IDENTITY_UNAVAILABLE' }
  }
  if (!verified) {
    // Accepting an unverified address would let anyone claim someone else's
    // account by signing up a Google identity with their email.
    return { ok: false, error: 'OAUTH_EMAIL_UNVERIFIED' }
  }

  return {
    ok: true,
    identity: {
      googleId: sub,
      email: normalizedEmail,
      emailVerified: true,
      ...(name ? { name } : {}),
      ...(picture ? { picture } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// 4. The whole receive half, in one call (this is what the route uses)
// ---------------------------------------------------------------------------

/**
 * Run the complete PART B-1 pipeline for an incoming callback request:
 *   config → state validation → code exchange → verified identity.
 *
 * Guarantees:
 *   • The `bac_oauth_state` cookie is cleared on EVERY exit path, success or
 *     failure, so a state value can never be reused.
 *   • No user lookup/creation, no session work, no D1 write, no Drive call.
 *   • Errors are stable codes + HTTP statuses that leak nothing sensitive.
 *
 * PART B-2 consumes the `{ ok: true, identity }` branch — see "HANDOFF TO PART
 * B-2" in this file's header.
 */
export async function resolveGoogleCallbackIdentity(
  c: Context<{ Bindings: Env }>
): Promise<GoogleCallbackResult> {
  // Always burn the state cookie, whatever happens next.
  const finish = (result: GoogleCallbackResult): GoogleCallbackResult => {
    clearOAuthStateCookie(c)
    return result
  }

  const config = getGoogleOAuthExchangeConfig(c.env)
  if (!config) {
    return finish({ ok: false, error: 'OAUTH_NOT_CONFIGURED', status: 503 })
  }

  // Google reports user-side failures as `?error=access_denied` etc. Its value
  // is never echoed back to the browser.
  if (c.req.query('error')) {
    return finish({ ok: false, error: 'OAUTH_DENIED', status: 400 })
  }

  const code = (c.req.query('code') || '').trim()
  const state = (c.req.query('state') || '').trim()
  // Length caps keep an attacker from feeding us megabyte-long parameters.
  if (!code || code.length > 2048 || !state || state.length > 512) {
    return finish({ ok: false, error: 'OAUTH_BAD_REQUEST', status: 400 })
  }

  if (!(await validateOAuthStateParam(c, state))) {
    return finish({ ok: false, error: 'OAUTH_STATE_INVALID', status: 400 })
  }

  const tokens = await exchangeCodeForTokens(config, code)
  if (!tokens) {
    return finish({ ok: false, error: 'OAUTH_EXCHANGE_FAILED', status: 502 })
  }

  const identity = await readVerifiedIdentity(tokens, config.clientId)
  if (!identity.ok) {
    return finish({
      ok: false,
      error: identity.error,
      status: identity.error === 'OAUTH_EMAIL_UNVERIFIED' ? 403 : 502,
    })
  }

  return finish({ ok: true, identity: identity.identity })
}
