// ============================================================================
// تيسير — Admin account-management API (SERVER-SIDE) — Task 4B
//
// Admin-ONLY endpoints for provisioning + managing accounts. There is NO
// public self-signup anywhere in the app: the only way an account comes into
// existence is an authenticated admin calling POST /api/admin/accounts here.
//
// Every route in this router sits behind requireRole('admin') (see the
// `.use('/*', …)` guard below), so the checks are enforced server-side on
// EVERY request — the client is never trusted. The admin UI that consumes
// these endpoints is built later (Task 9); this task ships the protected
// endpoints + logic only.
//
//   GET    /api/admin/accounts            list all accounts
//   POST   /api/admin/accounts            create a subscriber (or admin) account
//   GET    /api/admin/accounts/:id        fetch one account
//   PATCH  /api/admin/accounts/:id        edit email / password / role
//   POST   /api/admin/accounts/:id/deactivate     suspend + revoke all sessions
//   POST   /api/admin/accounts/:id/reactivate     re-enable login
//   POST   /api/admin/accounts/:id/reset-device   revoke all sessions (device reset)
//
// No secrets are hardcoded.
// ============================================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from '../lib/drive'
import { requireRole, type AuthVars } from '../lib/guards'
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deactivateUser,
  reactivateUser,
  resetUserDevice,
  setUserApproval,
  accountErrorResponse,
  type Role,
} from '../lib/users'
import {
  listPendingDeviceRequests,
  approveDeviceRequest,
  rejectDeviceRequest,
} from '../lib/devices'

export const adminApi = new Hono<{ Bindings: Env; Variables: AuthVars }>()

// Same origin-locked, credentialed CORS as the other API routers so the
// httpOnly session cookie rides along.
adminApi.use('/*', async (c, next) => {
  const origin = c.env.SITE_ORIGIN
  const mw = cors({
    origin: origin ? [origin] : (o) => o,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
  return mw(c, next)
})

// EVERY admin endpoint requires a valid, live session on an ACTIVE admin
// account. This is the server-side wall — nothing below runs otherwise.
adminApi.use('/*', requireRole('admin'))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readJson(c: any): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

function coerceRole(v: unknown): Role | undefined {
  if (v === 'subscriber' || v === 'admin') return v
  return undefined
}

// ---------------------------------------------------------------------------
// GET /api/admin/accounts — list everyone.
// ---------------------------------------------------------------------------
adminApi.get('/accounts', async (c) => {
  const accounts = await listAccounts(c.env)
  return c.json({ ok: true, accounts })
})

// ---------------------------------------------------------------------------
// POST /api/admin/accounts — create an account (subscriber by default).
// Body: { email, password, role?, status? }
// ---------------------------------------------------------------------------
adminApi.post('/accounts', async (c) => {
  const body = await readJson(c)
  if (!body) return c.json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400)

  const result = await createAccount(c.env, {
    email: String(body.email ?? ''),
    password: String(body.password ?? ''),
    role: coerceRole(body.role),
    status: body.status === 'suspended' ? 'suspended' : 'active',
  })

  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account }, 201)
})

// ---------------------------------------------------------------------------
// GET /api/admin/accounts/:id — one account.
// ---------------------------------------------------------------------------
adminApi.get('/accounts/:id', async (c) => {
  const account = await getAccount(c.env, c.req.param('id'))
  if (!account) {
    return c.json({ ok: false, error: 'NOT_FOUND', message: 'Account not found.' }, 404)
  }
  return c.json({ ok: true, account })
})

// ---------------------------------------------------------------------------
// PATCH /api/admin/accounts/:id — edit email / password / role.
// Body: { email?, password?, role? }
// ---------------------------------------------------------------------------
adminApi.patch('/accounts/:id', async (c) => {
  const body = await readJson(c)
  if (!body) return c.json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400)

  const actingAdmin = c.get('user') // set by requireRole guard

  const result = await updateAccount(
    c.env,
    c.req.param('id'),
    {
      email: body.email !== undefined ? String(body.email) : undefined,
      password: body.password !== undefined ? String(body.password) : undefined,
      role: body.role !== undefined ? (coerceRole(body.role) ?? ('' as Role)) : undefined,
    },
    actingAdmin.id
  )

  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account })
})

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/deactivate — suspend + INSTANTLY revoke all
// sessions for that user (they're locked out on their next request).
// ---------------------------------------------------------------------------
adminApi.post('/accounts/:id/deactivate', async (c) => {
  const actingAdmin = c.get('user')
  const result = await deactivateUser(c.env, c.req.param('id'), actingAdmin.id)
  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account })
})

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/reactivate — re-enable login.
// ---------------------------------------------------------------------------
adminApi.post('/accounts/:id/reactivate', async (c) => {
  const result = await reactivateUser(c.env, c.req.param('id'))
  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account })
})

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/reset-device — revoke ALL of the account's live
// sessions WITHOUT suspending it. The account stays active; the user is simply
// signed out everywhere and can log in again on a fresh device. This is the
// "I got a new phone/laptop" support action.
// ---------------------------------------------------------------------------
adminApi.post('/accounts/:id/reset-device', async (c) => {
  const result = await resetUserDevice(c.env, c.req.param('id'))
  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account })
})

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/approve — grant full file access.
// The account can already log in + browse; this unlocks every file for them.
// The change is live on their next request WITHOUT logging them out.
// ---------------------------------------------------------------------------
adminApi.post('/accounts/:id/approve', async (c) => {
  const result = await setUserApproval(c.env, c.req.param('id'), true)
  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account })
})

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/unapprove — re-lock file access.
// The account stays active and can keep browsing, but files re-lock instantly
// (they hit the contact popup again). The user is NOT logged out.
// ---------------------------------------------------------------------------
adminApi.post('/accounts/:id/unapprove', async (c) => {
  const result = await setUserApproval(c.env, c.req.param('id'), false)
  if (!result.ok) {
    const { status, message } = accountErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true, account: result.account })
})

// ---------------------------------------------------------------------------
// Device-switch requests (single-device binding) — admin review queue.
//
// Every time a login is blocked because it came from a device other than the
// account's bound one, a pending row is recorded (see src/lib/devices.ts). The
// admin lists them here and Approves (rebind to the new device) or Rejects
// (keep the old device). All checks stay server-side behind requireRole('admin').
//
//   GET  /api/admin/device-requests               list pending requests
//   POST /api/admin/device-requests/:id/approve   approve → rebind allowed device
//   POST /api/admin/device-requests/:id/reject    reject  → keep old device
// ---------------------------------------------------------------------------
adminApi.get('/device-requests', async (c) => {
  const requests = await listPendingDeviceRequests(c.env)
  return c.json({ ok: true, requests })
})

function deviceErrorResponse(error: 'NO_DB' | 'NOT_FOUND' | 'ALREADY_RESOLVED'): {
  status: 404 | 409 | 503
  message: string
} {
  switch (error) {
    case 'NO_DB':
      return { status: 503, message: 'Device request store is unavailable.' }
    case 'NOT_FOUND':
      return { status: 404, message: 'Device request not found.' }
    case 'ALREADY_RESOLVED':
      return { status: 409, message: 'This request has already been resolved.' }
  }
}

adminApi.post('/device-requests/:id/approve', async (c) => {
  const result = await approveDeviceRequest(c.env, c.req.param('id'))
  if (!result.ok) {
    const { status, message } = deviceErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true })
})

adminApi.post('/device-requests/:id/reject', async (c) => {
  const result = await rejectDeviceRequest(c.env, c.req.param('id'))
  if (!result.ok) {
    const { status, message } = deviceErrorResponse(result.error)
    return c.json({ ok: false, error: result.error, message }, status)
  }
  return c.json({ ok: true })
})
