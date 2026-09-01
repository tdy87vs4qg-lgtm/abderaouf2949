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

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(INITIAL)

  useEffect(() => {
    let cancelled = false

    // HARD DEADLINE on the probe. On iOS/Android the first fetch after the
    // app returns from background can reuse a dead pooled connection and hang
    // for ~30s until the OS gives up on the socket. Nothing in the UI may
    // wait that long: after 6s the request is aborted and the hook resolves
    // to the neutral signed-out state (the same state a failed probe already
    // produces). The server stays the only authority — this never asserts a
    // logout server-side, it only stops the UI from hanging on a dead socket.
    const PROBE_TIMEOUT_MS = 6000
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const probeTimer = controller
      ? window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      : null

    async function load() {
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
        if (cancelled) return

        if (res.ok && data && data.ok && data.authenticated && data.user) {
          const user: SessionUser = {
            id: data.user.id,
            email: data.user.email,
            role: data.user.role,
            approved: !!data.user.approved,
          }
          setState({
            loading: false,
            authenticated: true,
            user,
            destination: user.role === 'admin' ? '/admin' : '/library',
          })
          return
        }

        // Explicitly unauthenticated (or a malformed/empty response). Reflect
        // the logged-out state — but only AFTER we actually asked the server,
        // never as the default assumption.
        setState({ loading: false, authenticated: false, user: null, destination: null })
      } catch {
        if (cancelled) return
        // Network/transient failure: don't claim "logged out". Leave the UI in
        // its neutral (not-authenticated, not-loading) state without asserting a
        // logout, so a blip never flips a signed-in user to the guest UI.
        setState({ loading: false, authenticated: false, user: null, destination: null })
      }
    }

    load().finally(() => {
      if (probeTimer != null) window.clearTimeout(probeTimer)
    })
    return () => {
      cancelled = true
      if (probeTimer != null) window.clearTimeout(probeTimer)
    }
  }, [])

  return state
}
