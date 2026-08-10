// ============================================================================
// تيسير — Cryptographic primitives (SERVER-SIDE, Web Crypto only)
//
// Everything here uses the Workers-native Web Crypto API (crypto.subtle,
// crypto.getRandomValues). No Node.js `crypto` module, no third-party deps —
// so it runs unchanged on the Cloudflare edge.
//
// Provides:
//   • PBKDF2 password hashing + constant-time verification (strong, salted).
//   • Cryptographically-random opaque tokens for sessions.
//   • SHA-256 hashing (used to store only a token *digest* at rest in D1/KV,
//     so a DB/KV leak never yields a usable session token).
//   • HMAC-signed token binding to SESSION_SECRET (defence in depth: a token
//     minted without the secret can't validate, even if the store is writable).
// ============================================================================

// --- Tunables -------------------------------------------------------------
// PBKDF2 iteration count. The Cloudflare edge runtime rejects iteration counts
// above 100,000 (causing a 500 on every login/signup), so we cap at the
// edge-allowed maximum of 100,000.
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_HASH = 'SHA-256'
const SALT_BYTES = 16
const KEY_BYTES = 32 // 256-bit derived key
const TOKEN_BYTES = 32 // 256-bit session token

const enc = new TextEncoder()

// ---------------------------------------------------------------------------
// Base helpers
// ---------------------------------------------------------------------------
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return hex
}

/** URL-safe, unpadded base64 (safe inside a cookie value). */
function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2)
//
// Stored format (single string, self-describing so params can evolve):
//   pbkdf2$<hash>$<iterations>$<saltB64>$<keyB64>
// ---------------------------------------------------------------------------
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_HASH}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(key)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false
  const [, , iterStr, saltB64, keyB64] = parts
  const iterations = Number(iterStr)
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = fromBase64(saltB64)
    expected = fromBase64(keyB64)
  } catch {
    return false
  }

  const actual = await deriveKey(password, salt, iterations, expected.length)
  return timingSafeEqual(actual, expected)
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  length = KEY_BYTES
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: PBKDF2_HASH },
    baseKey,
    length * 8
  )
  return new Uint8Array(bits)
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

/** A fresh, opaque, URL-safe 256-bit session token (the value put in the cookie). */
export function generateToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

/** Opaque random id (uuid-ish) for primary keys that shouldn't be sequential. */
export function generateId(): string {
  // crypto.randomUUID is available in the Workers runtime.
  return crypto.randomUUID()
}

/**
 * Deterministic digest of a session token, keyed by SESSION_SECRET.
 * Only this digest is ever persisted (D1 + KV) — the raw token lives only in
 * the user's cookie. Because it's HMAC-keyed by the secret, an attacker who
 * can write to the store still cannot forge a token that validates.
 */
export async function hashToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(token))
  return toHex(new Uint8Array(sig))
}

/**
 * Deterministic, secret-keyed digest of a raw device fingerprint. Only this
 * digest is ever stored (users.device_fingerprint / device_requests) — the raw
 * fingerprint string the browser sends never touches the database. Keyed by
 * SESSION_SECRET so a DB leak can't be correlated back to a device without the
 * secret. (Shares the same HMAC construction as hashToken by design.)
 */
export async function hashFingerprint(fingerprint: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('device:' + fingerprint))
  return toHex(new Uint8Array(sig))
}

// ---------------------------------------------------------------------------
// Constant-time comparison (avoids leaking match length via timing)
// ---------------------------------------------------------------------------
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
