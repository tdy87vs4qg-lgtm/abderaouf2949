import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// useSession — exterior SPA session restore (Fix #1)
//
// The public React SPA (home / login / signup / subscription) previously never
// asked the server "who am I?", so on '/', '/login', etc. it ALWAYS rendered
// the logged-out UI even when a valid `bac_session` cookie existed. To a user
// who refreshes or returns later that looks exactly like being logged out.
//
// This hook fixes that: on mount it calls GET /api/auth/me with
// credentials:'same-origin' (so the httpOnly cookie rides along) and exposes
// the authenticated state. Hitting /me also SLIDES the session + cookie forward
// server-side (see src/routes/auth.ts), so simply loading the exterior keeps a
// returning user signed in for the full ~1yr window. The request is a plain
// read — it never mutates or clears anything — so a hard refresh can no longer
// visually "log the user out".
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string
  email: string
  role: 'subscriber' | 'admin'
  approved: boolean
}

export type SessionState = {
  /** True until the first /me response resolves — render neutral UI meanwhile. */
  loading: boolean
  /** True when a live session was confirmed by the server. */
  authenticated: boolean
  /** The safe user snapshot when authenticated, else null. */
  user: SessionUser | null
  /** Where a signed-in user should go (admins → console, others → library). */
  destination: string | null
}

const INITIAL: SessionState = {
  loading: true,
  authenticated: false,
  user: null,
  destination: null,
}

const SIGNED_OUT: SessionState = {
  loading: false,
  authenticated: false,
  user: null,
  destination: null,
}

// HARD DEADLINE on the probe. On iOS/Android the first fetch after the app
// returns from background can reuse a dead pooled connection and hang for
// ~30s until the OS gives up on the socket. Nothing in the UI may wait that
// long: after PROBE_TIMEOUT_MS the request is aborted and the hook resolves to
// the neutral signed-out state (the same state a failed probe already
// produces). The server stays the only authority — this never asserts a
// logout server-side, it only stops the UI from hanging on a dead socket.
const PROBE_TIMEOUT_MS = 6000

// ---------------------------------------------------------------------------
// ONE probe per page load, shared by every hook instance.
//
// Several components mount useSession() at once (HomePage + SiteHeader on the
// exterior, AuthShell on /login). Each instance used to own its own fetch, so
// a single page load fired 2–3 identical /api/auth/me requests, each with its
// own 6s abort timer, each resolving at a slightly different moment. The
// instances now subscribe to a single module-level promise: the first mount
// starts the probe, later mounts just attach to it, and the resolved answer is
// memoised so any instance mounted afterwards (e.g. a route change) resolves
// synchronously with no network at all.
//
// This is a read-only in-memory memo for the lifetime of the document. A full
// navigation (which is how login / logout hand off to the server pages)
// naturally discards it, so it can never mask a real session change.
// ---------------------------------------------------------------------------
let probePromise: Promise<SessionState> | null = null
let resolvedState: SessionState | null = null

function probeSession(): Promise<SessionState> {
  if (resolvedState) return Promise.resolve(resolvedState)
  if (probePromise) return probePromise

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const probeTimer = controller
    ? window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    : null

  probePromise = (async (): Promise<SessionState> => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      })
      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (res.ok && data && data.ok && data.authenticated && data.user) {
        const user: SessionUser = {
          id: data.user.id,
          email: data.user.email,
          role: data.user.role,
          approved: !!data.user.approved,
        }
        return {
          loading: false,
          authenticated: true,
          user,
          destination: user.role === 'admin' ? '/admin' : '/library',
        }
      }

      // Explicitly unauthenticated (or a malformed/empty response). Reflect
      // the logged-out state — but only AFTER we actually asked the server,
      // never as the default assumption.
      return SIGNED_OUT
    } catch {
      // Network/transient failure (or our own abort): don't claim "logged
      // out". Resolve to the neutral (not-authenticated, not-loading) state
      // without asserting a logout, so a blip never flips a signed-in user to
      // the guest UI server-side.
      return SIGNED_OUT
    } finally {
      if (probeTimer != null) window.clearTimeout(probeTimer)
    }
  })()

  probePromise.then((state) => {
    resolvedState = state
  })
  return probePromise
}

export function useSession(): SessionState {
  // Late mounts pick up the memoised answer synchronously — no loading flash.
  const [state, setState] = useState<SessionState>(() => resolvedState || INITIAL)

  useEffect(() => {
    if (resolvedState) {
      setState(resolvedState)
      return
    }
    let cancelled = false
    probeSession().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
