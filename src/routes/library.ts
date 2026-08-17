// ============================================================================
// تيسير — Library API routes (SERVER-SIDE)
//
// These endpoints proxy Google Drive listings. The Google credential (a SERVICE
// ACCOUNT JSON key when configured — which is what makes PRIVATE Drive files
// readable — otherwise the plain API key as a fallback) and the root folder id
// are read from environment bindings inside the Worker and are never sent to
// the browser. The client receives only normalised DriveNode data plus a
// per-request `locked` flag decided on the server.
// ============================================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  listFolder,
  searchLibrary,
  getThumbnail,
  getFileMeta,
  getFileContent,
  sampleFileContent,
  driveConfigured,
  type Env,
} from '../lib/drive'
import { isApproved } from '../lib/auth'
import { requireActiveSubscriber, type AuthVars } from '../lib/guards'

type Bindings = Env

export const libraryApi = new Hono<{ Bindings: Bindings; Variables: AuthVars }>()

// Lock CORS to the site origin (falls back to same-origin when unset).
libraryApi.use('/*', async (c, next) => {
  const origin = c.env.SITE_ORIGIN
  const mw = cors({
    origin: origin ? [origin] : (o) => o, // reflect same-origin in dev
    credentials: true,
    allowMethods: ['GET', 'OPTIONS'],
  })
  return mw(c, next)
})

/**
 * GET /api/library/list?folder=<driveFolderId>
 * Lists folders + files inside a Drive folder (root when omitted).
 * Response is safe for the browser; the API key stays server-side.
 */
libraryApi.get('/list', async (c) => {
  const folder = c.req.query('folder') || undefined
  // "subscriber" here means "entitled to open files" = an approved subscriber
  // or an admin. A signed-in but not-yet-approved account gets locked files.
  const subscriber = await isApproved(c)

  try {
    const listing = await listFolder(c.env, folder, {
      isSubscriber: subscriber,
      ctx: c.executionCtx as unknown as ExecutionContext,
    })

    // Short client cache + SWR to keep navigation instant without staleness risk.
    c.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=300')

    return c.json({
      ok: true,
      subscriber,
      ...listing,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ ok: false, error: 'DRIVE_LIST_FAILED', message }, 502)
  }
})

/**
 * GET /api/library/search?q=<query>
 * Searches file AND folder names across the entire library and returns the
 * matching folders + files (each annotated with the folder they live in).
 * Files carry a per-request `locked` flag exactly like /list — the client
 * renders a lock and opens the subscribe modal for non-subscribers. As with
 * /list, this response is safe for the browser; the API key stays server-side.
 */
libraryApi.get('/search', async (c) => {
  const q = c.req.query('q') || ''
  const subscriber = await isApproved(c)

  // Trivial guard: very short queries return nothing (keeps it fast + tidy).
  if (q.trim().length < 2) {
    return c.json({ ok: true, subscriber, query: q.trim(), folders: [], files: [], sample: false, truncated: false })
  }

  try {
    const result = await searchLibrary(c.env, q, { isSubscriber: subscriber })
    c.header('Cache-Control', 'private, max-age=15, stale-while-revalidate=120')
    return c.json({ ok: true, subscriber, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ ok: false, error: 'DRIVE_SEARCH_FAILED', message }, 502)
  }
})

/**
 * GET /api/library/thumb/:id
 * Server-proxied thumbnail for a Drive file. The Drive thumbnailLink and API
 * key are resolved and fetched SERVER-SIDE; the browser only ever sees this
 * same-origin URL. Thumbnails are cached at the edge. When Drive isn't
 * configured (sample mode) a tasteful generated SVG placeholder is returned so
 * the lazy-load pipeline is fully exercised in dev.
 */
libraryApi.get('/thumb/:id', async (c) => {
  const id = c.req.param('id')

  // Sample mode → return a lightweight, cache-friendly SVG placeholder.
  if (!driveConfigured(c.env)) {
    const svg = samplePlaceholderSvg(id)
    c.header('Content-Type', 'image/svg+xml; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=86400')
    return c.body(svg)
  }

  try {
    const thumb = await getThumbnail(c.env, id)
    if (!thumb) return c.body(null, 404)
    c.header('Content-Type', thumb.contentType)
    // Thumbnails are immutable-ish; cache aggressively at the edge + browser.
    c.header('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400')
    return c.body(thumb.body)
  } catch {
    return c.body(null, 502)
  }
})

/** Deterministic, brand-consistent SVG placeholder for sample thumbnails. */
function samplePlaceholderSvg(seed: string): string {
  // Pick from the calm design-system palette based on the id (deterministic).
  const palettes = [
    ['#F5F1E8', '#7A6A52'], // parchment / warm ink
    ['#EDE7F0', '#5B4B6E'], // muted plum
    ['#E7EDEA', '#3F5B52'], // muted forest
    ['#EDE9E3', '#8A6D3B'], // muted gold
  ]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [bg, fg] = palettes[h % palettes.length]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200" role="img" aria-label="Document preview">
  <rect width="320" height="200" fill="${bg}"/>
  <g fill="none" stroke="${fg}" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round">
    <path d="M118 60 h84 M118 84 h84 M118 108 h60"/>
  </g>
  <rect x="104" y="40 " width="112" height="120" rx="6" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="4"/>
  <text x="160" y="184" text-anchor="middle" font-family="Tajawal, Noto Kufi Arabic, sans-serif" font-size="13" fill="${fg}" fill-opacity="0.6">Preview</text>
</svg>`
}

/**
 * GET /api/library/config
 * Lightweight bootstrap: whether the viewer is a subscriber and whether the
 * library is currently backed by real Drive data or labelled sample content.
 * Never leaks secret values — only booleans.
 */
libraryApi.get('/config', async (c) => {
  const configured = driveConfigured(c.env)
  return c.json({
    ok: true,
    subscriber: await isApproved(c),
    driveConfigured: configured,
  })
})

// ===========================================================================
// FILE-CONTENT GATE — Task 4C
//
// These endpoints expose the ACTUAL file content (bytes for the viewer, plus
// its safe metadata). They are the "locked" resources: a guest or a non-
// subscriber can browse titles/thumbnails all day via /list, but the moment
// they ask for content they are blocked SERVER-SIDE by requireActiveSubscriber.
//
// requireActiveSubscriber returns a clean JSON envelope
//   { ok:false, error:'UNAUTHENTICATED'|'ACCOUNT_SUSPENDED'|'FORBIDDEN', message }
// with 401/403. For content routes we normalise the "not entitled" cases to a
// dedicated SUBSCRIPTION_REQUIRED signal (402) so the client can unambiguously
// pop the subscription modal (Task 5), while still refusing to serve any bytes.
// The client is NEVER trusted: even a forged `locked:false` in the listing gets
// nothing here, because access is re-decided from the validated session.
// ===========================================================================

/**
 * Wrap requireActiveSubscriber so that, for CONTENT routes, an authenticated-
 * but-unentitled user (or a guest) gets a single, explicit SUBSCRIPTION_REQUIRED
 * response the UI keys off to open the subscribe modal. Real auth problems keep
 * their precise codes. No bytes are ever emitted on the deny path.
 */
async function gateContent(c: any, next: any) {
  // Delegate to the shared server-side guard. If it allows the request it calls
  // next(); otherwise it returns its own 401/403 JSON — which we then re-shape.
  let passed = false
  const res = await requireActiveSubscriber(c, async () => {
    passed = true
    await next()
  })
  if (passed) return res

  // Guard denied. Re-map "not a subscriber / not signed in" to a clean,
  // client-friendly "subscription required" envelope (still a hard server-side
  // block — no content leaks). Suspended accounts keep their own signal.
  const denied = res as Response
  try {
    const clone = denied.clone()
    const body = (await clone.json()) as { error?: string }
    if (body?.error === 'ACCOUNT_SUSPENDED') {
      return denied // keep 403 ACCOUNT_SUSPENDED as-is
    }
  } catch {
    /* non-JSON — fall through to the standard envelope */
  }
  return c.json(
    {
      ok: false,
      error: 'SUBSCRIPTION_REQUIRED',
      // Clear Arabic message: browsing is free for everyone, but opening a file
      // requires a subscription arranged with the owner (TikTok).
      message:
        'هذا الملف متاح للمشتركين فقط. للاشتراك تواصل مع المالك عبر تيك توك لفتح جميع الملفات داخل الموقع.',
      contact: 'https://www.tiktok.com/@abderahmane.lovenature',
      locked: true,
    },
    402
  )
}

/**
 * GET /api/library/file/:id/meta  — subscriber-gated
 * Safe metadata (title, type, viewer hint) for the in-app viewer chrome.
 * Blocked for everyone who isn't an active subscriber.
 */
libraryApi.get('/file/:id/meta', gateContent, async (c) => {
  const id = c.req.param('id')
  const meta = await getFileMeta(c.env, id)
  if (!meta) {
    // Includes the case where the id is a Drive shortcut whose target can't be
    // accessed by the API key — surface a clear Arabic message, never a crash.
    return c.json(
      { ok: false, error: 'FILE_UNAVAILABLE', message: 'هذا الملف غير متاح حاليًا، يرجى التواصل مع المشرف.' },
      404
    )
  }
  // File metadata is effectively immutable → let the browser reuse it so
  // re-opening / switching back to a file needs no round trip at all.
  c.header('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600')
  return c.json({ ok: true, file: meta })
})

/**
 * GET /api/library/file/:id/content  — subscriber-gated
 * Streams the file bytes THROUGH the Worker. The browser never sees a raw
 * Drive URL or the API key. Rendered inline (viewer), never forced-downloaded.
 * Only active subscribers reach this handler; everyone else is blocked above.
 */
libraryApi.get('/file/:id/content', gateContent, async (c) => {
  const id = c.req.param('id')

  // Range passthrough: PDF.js (and <video>/<img> seeking) asks for byte ranges so
  // the first page can paint before the whole file has arrived. We forward the
  // header verbatim to Drive and mirror its partial response back. When the
  // browser sends NO Range header this is undefined and the handler behaves
  // exactly as it always has — a full 200 body. The gate above is untouched:
  // every range request is authenticated and subscription-checked identically.
  const range = c.req.header('Range')

  const content = driveConfigured(c.env)
    ? await getFileContent(c.env, id, range)
    : sampleFileContent(id)

  if (!content) {
    // Covers an inaccessible shortcut target (or a genuinely missing file):
    // return a clear Arabic message instead of crashing or leaking details.
    return c.json(
      { ok: false, error: 'FILE_UNAVAILABLE', message: 'هذا الملف غير متاح حاليًا، يرجى التواصل مع المشرف.' },
      404
    )
  }

  c.header('Content-Type', content.contentType)
  // Inline so it renders in the embedded viewer; never a forced download.
  c.header('Content-Disposition', `inline; filename="${content.filename}"`)
  // Private (per-subscriber) + short cache; content is subscriber-gated.
  c.header('Cache-Control', 'private, max-age=300')
  // Defence-in-depth against embedding the raw bytes off-site.
  c.header('X-Content-Type-Options', 'nosniff')
  if (typeof content.size === 'number') c.header('Content-Length', String(content.size))

  // Tell the client it may seek. Advertised on the full 200 too, so PDF.js knows
  // it can issue range requests for the pages it actually needs.
  c.header('Accept-Ranges', content.acceptRanges || 'bytes')

  // Drive honoured the forwarded Range → mirror the partial response verbatim
  // (206 + Content-Range, with Content-Length already set to the PARTIAL length
  // above). Without a Range header `content.status` is 200/undefined and we fall
  // through to the unchanged full-body response.
  if (content.status === 206 && content.contentRange) {
    c.header('Content-Range', content.contentRange)
    return c.body(content.body as any, 206)
  }

  return c.body(content.body as any)
})
