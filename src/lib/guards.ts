// ============================================================================
// تيسير — Route-protection middleware (SERVER-SIDE) — Task 4B
//
// Thin Hono middlewares layered directly on Part A's session-validation helper
// (getSessionUser → validateSession, which itself re-checks status + silently
// renews). EVERY decision here is made on the server from the validated
// session; nothing is ever read from or trusted about the client beyond the
// opaque httpOnly cookie. The resolved user is stashed on the Hono context so
// downstream handlers reuse it without re-validating.
//
// Exposed guards:
//   • requireAuth               — 401 unless a valid, live session exists.
//   • requireRole('admin'|…)    — 401 if unauthenticated, 403 if wrong role.
//   • requireActiveSubscriber   — a live session whose account is active
//                                 (subscriber OR admin — admins are a superset).
//
// Because validateSession already returns null for suspended accounts AND for
// sessions that were revoked (deactivation deletes them from D1+KV), a just-
// deactivated user is rejected here on their very next request. No extra check
// needed — the guard inherits that guarantee from the session engine.
// ============================================================================

import type { Context, Next } from 'hono'
import type { Env } from './drive'
import { getSessionUser, type SessionUser } from './auth'
import type { Role } from './users'

// Typed context variables so handlers can read the authenticated user safely.
export type AuthVars = { user: SessionUser }
export type AuthContext = Context<{ Bindings: Env; Variables: AuthVars }>

/** Standard JSON error envelope so the client always gets a clear reason. */
function deny(
  c: Context,
  status: 401 | 403,
  error: string,
  message: string
) {
  return c.json({ ok: false, error, message }, status)
}

/**
 * requireAuth — rejects (401) unless the request carries a valid, live session.
 * On success the validated user is placed on c.var.user for downstream use.
 */
export async function requireAuth(c: AuthContext, next: Next) {
  const user = await getSessionUser(c)
  if (!user) {
    return deny(c, 401, 'UNAUTHENTICATED', 'You must be signed in to do that.')
  }
  // Defence in depth: validateSession already filters suspended accounts, but
  // we assert it here too so the guarantee is local + obvious.
  if (user.status !== 'active') {
    return deny(c, 403, 'ACCOUNT_SUSPENDED', 'This account has been deactivated.')
  }
  c.set('user', user)
  await next()
}

/**
 * requireRole(role) — must be authenticated AND hold the given role.
 * 401 when not signed in, 403 when signed in but lacking the role. Admins are
 * NOT auto-granted other roles here; pass 'admin' explicitly for admin gates.
 */
export function requireRole(role: Role) {
  return async (c: AuthContext, next: Next) => {
    const user = await getSessionUser(c)
    if (!user) {
      return deny(c, 401, 'UNAUTHENTICATED', 'You must be signed in to do that.')
    }
    if (user.status !== 'active') {
      return deny(c, 403, 'ACCOUNT_SUSPENDED', 'This account has been deactivated.')
    }
    if (user.role !== role) {
      return deny(
        c,
        403,
        'FORBIDDEN',
        role === 'admin'
          ? 'Administrator privileges are required.'
          : `This action requires the '${role}' role.`
      )
    }
    c.set('user', user)
    await next()
  }
}

/**
 * requireActiveSubscriber — a live session on an ACTIVE account that is
 * entitled to OPEN FILES.
 *
 * Under the open-signup + admin-approval model this now means: an active admin
 * (always entitled) OR an active subscriber whom an admin has APPROVED. A
 * self-registered but not-yet-approved account has a perfectly valid live
 * session and can browse everything, but it is NOT entitled to file content —
 * it is denied here (FORBIDDEN), which the content routes reshape into the
 * SUBSCRIPTION_REQUIRED signal the UI uses to open the contact popup.
 *
 * The name is kept for backwards compatibility with existing callers; the
 * meaning is "entitled to open files".
 */
export async function requireActiveSubscriber(c: AuthContext, next: Next) {
  const user = await getSessionUser(c)
  if (!user) {
    return deny(c, 401, 'UNAUTHENTICATED', 'Please sign in to access the library.')
  }
  if (user.status !== 'active') {
    return deny(c, 403, 'ACCOUNT_SUSPENDED', 'This account has been deactivated.')
  }
  if (user.role !== 'subscriber' && user.role !== 'admin') {
    return deny(c, 403, 'FORBIDDEN', 'An active subscription is required.')
  }
  // Admins are always entitled; subscribers must be approved by an admin.
  if (user.role !== 'admin' && user.approved !== true) {
    return deny(
      c,
      403,
      'NOT_APPROVED',
      'Your account is awaiting approval. Contact us to unlock the files.'
    )
  }
  c.set('user', user)
  await next()
}
