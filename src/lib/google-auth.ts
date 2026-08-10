// ============================================================================
// تيسير — Google Service Account authentication (SERVER-SIDE ONLY)
//
// Mints Google OAuth2 access tokens from a Service Account key using a signed
// JWT ("two-legged OAuth" / JWT-bearer grant). This is what allows the library
// to read PRIVATE Google Drive files: a plain `?key=API_KEY` request can only
// ever see files that are shared publicly, whereas a Service Account bearer
// token acts as a real Drive principal (the folder is shared with the service
// account's client_email).
//
// Runtime constraints honoured here:
//   • Cloudflare Workers ONLY — no Node.js APIs. Signing uses Web Crypto
//     (crypto.subtle) with RSASSA-PKCS1-v1_5 + SHA-256, i.e. RS256, which is
//     the algorithm Google's token endpoint requires for service accounts.
//   • No `fs`, no `Buffer` — base64/base64url are done with atob/btoa.
//
// SECURITY
//   • The Service Account JSON is read from the `GOOGLE_SERVICE_ACCOUNT_JSON`
//     env binding (Cloudflare secret / .dev.vars) and NEVER hardcoded.
//   • The private key, the signed assertion, and the access token are NEVER
//     logged, thrown inside an error message, or serialised to the browser.
//     Error messages are deliberately reduced to a status + Google's own
//     `error` / `error_description` fields.
//   • Tokens are cached in memory (per isolate) only — they are never written
//     to KV/D1 or any other persistent store.
// ============================================================================

/** Read-only Drive scope — the app never writes to Drive. */
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

/** Shape of the fields we need out of a Google Service Account JSON key. */
interface ServiceAccountKey {
  type?: string
  client_email?: string
  private_key?: string
  private_key_id?: string
  token_uri?: string
}

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
/** Refresh a little before real expiry so in-flight requests never race it. */
const EXPIRY_SKEW_SECONDS = 60
/** Requested token lifetime (Google caps service-account JWTs at 1 hour). */
const TOKEN_LIFETIME_SECONDS = 3600

// ---------------------------------------------------------------------------
// Per-isolate caches. Tokens live in memory ONLY (never persisted anywhere).
// ---------------------------------------------------------------------------
interface CachedToken {
  token: string
  /** Absolute epoch ms after which the token must be re-minted. */
  expiresAt: number
}
const tokenCache = new Map<string, CachedToken>()
/** Collapse concurrent mint requests for the same key+scope into one fetch. */
const tokenInflight = new Map<string, Promise<string>>()
/** Imported CryptoKey cache — importKey is comparatively expensive. */
const signingKeyCache = new Map<string, Promise<CryptoKey>>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * True when a usable-looking Service Account JSON is configured. Cheap, purely
 * structural check (no parsing of the key material, no network).
 */
export function hasServiceAccount(raw: string | undefined): boolean {
  if (!raw) return false
  const s = raw.trim()
  if (!s) return false
  return s.startsWith('{') && s.includes('private_key') && s.includes('client_email')
}

/**
 * Get a (cached) OAuth2 access token for the given scope from the Service
 * Account JSON. Returns null when no Service Account is configured, so callers
 * can transparently fall back to the plain API-key path.
 *
 * Never logs or exposes the private key.
 */
export async function getServiceAccountToken(
  rawJson: string | undefined,
  scope: string = DRIVE_READONLY_SCOPE
): Promise<string | null> {
  if (!hasServiceAccount(rawJson)) return null

  const key = parseServiceAccount(rawJson as string)
  if (!key) return null

  const cacheKey = `${key.client_email}|${key.private_key_id || ''}|${scope}`

  // 1. Fresh cached token?
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  // 2. Another request already minting the same token? Join it.
  const inflight = tokenInflight.get(cacheKey)
  if (inflight) return inflight

  // 3. Mint a new one.
  const run = mintToken(key, scope)
    .then((minted) => {
      tokenCache.set(cacheKey, {
        token: minted.token,
        expiresAt: Date.now() + Math.max(0, minted.expiresIn - EXPIRY_SKEW_SECONDS) * 1000,
      })
      return minted.token
    })
    .finally(() => {
      tokenInflight.delete(cacheKey)
    })

  tokenInflight.set(cacheKey, run)
  return run
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Parse + normalise the Service Account JSON. Tolerates the two shapes people
 * paste into a secret: real JSON (with `\n` escapes inside private_key, which
 * JSON.parse turns into newlines) and JSON whose private_key still carries
 * LITERAL backslash-n sequences after parsing — both end up as a valid PEM.
 * Returns null (never throws, never logs) when the value is unusable.
 */
function parseServiceAccount(rawJson: string): ServiceAccountKey | null {
  let parsed: ServiceAccountKey
  try {
    parsed = JSON.parse(rawJson) as ServiceAccountKey
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  if (!parsed.client_email || !parsed.private_key) return null

  // Normalise escaped newlines so the PEM always has real line breaks.
  const private_key = parsed.private_key.replace(/\\n/g, '\n')
  if (!private_key.includes('BEGIN') || !private_key.includes('PRIVATE KEY')) return null

  return {
    type: parsed.type,
    client_email: parsed.client_email,
    private_key,
    private_key_id: parsed.private_key_id,
    token_uri: parsed.token_uri || DEFAULT_TOKEN_URI,
  }
}

/** Exchange a self-signed JWT for an access token at Google's token endpoint. */
async function mintToken(
  key: ServiceAccountKey,
  scope: string
): Promise<{ token: string; expiresIn: number }> {
  const tokenUri = key.token_uri || DEFAULT_TOKEN_URI
  const assertion = await buildSignedJwt(key, scope, tokenUri)

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })

  if (!res.ok) {
    // Surface ONLY Google's error code/description — never the assertion, the
    // private key, or the raw request body.
    throw new Error(`Google token request failed (${res.status}): ${await safeTokenError(res)}`)
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) {
    throw new Error('Google token request returned no access_token')
  }
  return {
    token: json.access_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : TOKEN_LIFETIME_SECONDS,
  }
}

/** Extract a safe, short error description from a failed token response. */
async function safeTokenError(res: Response): Promise<string> {
  try {
    const body = await res.text()
    try {
      const j = JSON.parse(body) as { error?: string; error_description?: string }
      const parts = [j.error, j.error_description].filter(Boolean)
      if (parts.length) return parts.join(': ').slice(0, 200)
    } catch {
      /* not JSON — fall through */
    }
    // Redact anything that could resemble key material before surfacing.
    return body.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[redacted]').slice(0, 200)
  } catch {
    return 'unreadable error body'
  }
}

/** Build the RS256-signed JWT assertion Google's JWT-bearer grant expects. */
async function buildSignedJwt(
  key: ServiceAccountKey,
  scope: string,
  audience: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid: key.private_key_id }
  const claims = {
    iss: key.client_email,
    scope,
    aud: audience,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  }

  const signingInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(
    JSON.stringify(claims)
  )}`

  const cryptoKey = await importSigningKey(key)
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${b64urlFromBytes(new Uint8Array(signature))}`
}

/** Import the PKCS#8 private key as a Web Crypto RS256 signing key (cached). */
function importSigningKey(key: ServiceAccountKey): Promise<CryptoKey> {
  const cacheKey = `${key.client_email}|${key.private_key_id || ''}`
  const existing = signingKeyCache.get(cacheKey)
  if (existing) return existing

  const promise = crypto.subtle
    .importKey(
      'pkcs8',
      pemToDer(key.private_key as string),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, // not extractable — the key can never be read back out
      ['sign']
    )
    .catch(() => {
      // Drop the failed promise so a later request can retry, and never leak
      // the key material through the rejection value.
      signingKeyCache.delete(cacheKey)
      throw new Error('Service Account private key could not be imported (invalid PKCS#8 PEM)')
    })

  signingKeyCache.set(cacheKey, promise)
  return promise
}

/**
 * Strip the PEM armour and base64-decode the body into DER bytes.
 *
 * Returns a plain `ArrayBuffer` (not a Uint8Array view): under the Workers
 * types, `Uint8Array`'s buffer is `ArrayBufferLike`, which is NOT assignable to
 * `crypto.subtle.importKey`'s `BufferSource` parameter. Backing the bytes with
 * an explicit ArrayBuffer and handing that buffer over keeps the call
 * type-correct while producing the exact same DER bytes.
 */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const buffer = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return buffer
}

function b64urlFromString(input: string): string {
  return b64urlFromBytes(new TextEncoder().encode(input))
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
