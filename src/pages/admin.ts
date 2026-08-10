// ============================================================================
// تيسير — Admin dashboard PAGE (server-rendered) — Task 9 (Step 3/3)
//
// This is the admin-ONLY console UI. Access is enforced SERVER-SIDE by the
// requireRole('admin') check in src/index.tsx before this HTML is ever
// produced — a guest, a subscriber, or a suspended account never reaches this
// markup (they are redirected). The stats numbers are computed on the server
// (getSubscriberStats → D1) and baked into the page; the browser is only ever
// handed the final rendered figures, never a query or any privileged data.
//
// ── Step 1 scope (shipped) ─────────────────────────────────────────────────
//   • A read-only stats overview: "total subscribers" + "active subscribers".
//
// ── Step 2 scope (shipped) — CREATE & EDIT logic ───────────────────────────
//   • An account list + "New subscriber" form + per-row "Edit" form.
//
// ── Step 3 scope (THIS task) — DEACTIVATE, REACTIVATE & RESET DEVICE ────────
//   • A **"Deactivate" button** per active account that POSTs to
//     /api/admin/accounts/:id/deactivate — suspends the account AND revokes
//     every live session (instant lock-out). Suspended accounts instead show a
//     **"Reactivate"** button (POST …/reactivate) to re-enable login.
//   • A **"Reset device" button** per account that POSTs to
//     /api/admin/accounts/:id/reset-device — signs the subscriber out of every
//     device WITHOUT suspending them, so they can sign in fresh on a new one.
//   All three run through a shared confirmation dialog before firing.
//
// All privileged work still happens on the server: the forms only send the
// admin's intent; validation, hashing, uniqueness and session-revocation are
// all re-decided server-side on every request. No secrets are in this file.
// ============================================================================

import type { SubscriberStats } from '../lib/users'

/** HTML-escape helper for safely injecting server values into the page. */
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string)
  )
}

const usersIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`

const activeIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`

const pendingIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`

const plusIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`

const closeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`

const editIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`

// A warning triangle for the confirmation dialog.
const warnIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

// Device / smartphone glyph for the pending device-requests section.
const deviceIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`

/**
 * Render the admin dashboard shell + stats overview + account management UI.
 *
 * @param stats       server-computed subscriber counts (baked into the page)
 * @param adminEmail  the signed-in admin's email (for the header context)
 * @param adminId     the signed-in admin's id (so the client can flag "you")
 */
export function adminPage(stats: SubscriberStats, adminEmail: string, adminId: string): string {
  const total = stats.totalSubscribers
  const active = stats.activeSubscribers
  const pending = stats.pendingSubscribers

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Admin · Dashboard — تيسير</title>
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="/static/tokens.css" rel="stylesheet" />
  <link href="/static/components.css" rel="stylesheet" />
  <style>
    .admin-shell { min-height: 100vh; background: var(--color-surface-2, #f2ede3); }
    .admin-bar {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border, #e2d9c8);
      background: var(--color-surface, #fff); position: sticky; top: 0; z-index: 5;
    }
    .admin-bar .wordmark { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 1.15rem; color: var(--color-primary, #16324F); text-decoration: none; }
    .admin-bar .wordmark-accent { color: var(--color-accent, #B97E2C); }
    .admin-bar .admin-tag { margin-left: var(--space-1); font-size: .72rem; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; color: var(--color-text-muted, #7A6A52); }
    .admin-bar .admin-who { margin-left: auto; font-size: .85rem; color: var(--color-text-muted, #7A6A52); }
    .admin-main { max-width: var(--container-wide, 1080px); margin: 0 auto; padding: var(--space-8) var(--space-5) var(--space-9); }
    .admin-head { margin-bottom: var(--space-6); }
    .admin-head .overline { color: var(--color-accent, #B97E2C); }
    .admin-head h1 { font-family: 'Fraunces', Georgia, serif; color: var(--color-primary, #16324F); margin: var(--space-1) 0 var(--space-2); }
    .admin-head p { color: var(--color-text-muted, #7A6A52); max-width: 52ch; }

    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); }
    .stat-card {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e2d9c8);
      border-radius: var(--radius-lg, 14px);
      padding: var(--space-5);
      box-shadow: var(--elevation-1, 0 2px 10px rgba(22,50,79,.06));
      display: flex; flex-direction: column; gap: var(--space-3);
    }
    .stat-card-top { display: flex; align-items: center; gap: var(--space-3); }
    .stat-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 44px; height: 44px; border-radius: var(--radius-md, 10px);
      background: var(--color-primary-soft, #E9EFF5); color: var(--color-primary, #16324F);
    }
    .stat-card--active .stat-icon { background: rgba(46,125,80,.12); color: #2E7D50; }
    .stat-card--pending .stat-icon { background: rgba(185,126,44,.14); color: #B97E2C; }
    .stat-label { font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; color: var(--color-text-muted, #7A6A52); }
    .stat-value { font-family: 'Fraunces', Georgia, serif; font-size: 2.6rem; font-weight: 600; line-height: 1; color: var(--color-primary, #16324F); }
    .stat-note { font-size: .82rem; color: var(--color-text-muted, #7A6A52); margin: 0; }

    /* ── Pending device requests section ───────────────────────────────── */
    .devices-section { margin-top: var(--space-8); }
    .devices-head { margin-bottom: var(--space-4); }
    .devices-head h2 { font-family: 'Fraunces', Georgia, serif; color: var(--color-primary, #16324F); margin: var(--space-1) 0 0; display: inline-flex; align-items: center; gap: var(--space-2); }
    .devices-head .overline { color: var(--color-accent, #B97E2C); }
    .devices-head p { color: var(--color-text-muted, #7A6A52); font-size: .88rem; margin: var(--space-2) 0 0; }
    .devices-card {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e2d9c8);
      border-radius: var(--radius-lg, 14px);
      overflow: hidden;
    }
    .devices-loading, .devices-error, .devices-empty { padding: var(--space-5); font-size: .9rem; color: var(--color-text-muted, #7A6A52); }
    .devices-error { color: var(--color-danger, #b3261e); }
    .device-list { list-style: none; margin: 0; padding: 0; }
    .device-row {
      display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--color-border, #e2d9c8);
    }
    .device-row:first-child { border-top: 0; }
    .device-main { flex: 1 1 320px; min-width: 0; }
    .device-email { font-weight: 600; color: var(--color-primary, #16324F); }
    .device-info { font-size: .82rem; color: var(--color-text-muted, #7A6A52); margin-top: 2px; word-break: break-word; }
    .device-time { font-size: .78rem; color: var(--color-text-muted, #7A6A52); margin-top: 2px; }
    .device-actions { display: flex; gap: var(--space-2); flex: 0 0 auto; }
    .badge-devcount {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 1.4rem; height: 1.4rem; padding: 0 .45rem; margin-left: .5rem;
      border-radius: 999px; font-size: .78rem; font-weight: 700;
      background: var(--color-accent, #B97E2C); color: #fff; vertical-align: 2px;
    }
    .badge-devcount[hidden] { display: none; }

    /* ── Accounts section (Task 9, Step 2) ─────────────────────────────── */
    .accounts-section { margin-top: var(--space-8); }
    .accounts-head {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4);
    }
    .accounts-head h2 { font-family: 'Fraunces', Georgia, serif; color: var(--color-primary, #16324F); margin: var(--space-1) 0 0; }
    .accounts-head .overline { color: var(--color-accent, #B97E2C); }
    .accounts-head p { color: var(--color-text-muted, #7A6A52); font-size: .88rem; margin: var(--space-2) 0 0; }
    .btn .btn-ico { display: inline-flex; margin-right: .4rem; vertical-align: -3px; }

    .accounts-card {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e2d9c8);
      border-radius: var(--radius-lg, 14px);
      box-shadow: var(--elevation-1, 0 2px 10px rgba(22,50,79,.06));
      overflow: hidden;
    }
    .accounts-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    .accounts-table th, .accounts-table td { text-align: left; padding: var(--space-3) var(--space-4); vertical-align: middle; }
    .accounts-table thead th {
      font-size: .72rem; letter-spacing: .05em; text-transform: uppercase; font-weight: 700;
      color: var(--color-text-muted, #7A6A52); border-bottom: 1px solid var(--color-border, #e2d9c8);
      background: var(--color-surface-2, #faf6ee);
    }
    .accounts-table tbody tr { border-bottom: 1px solid var(--color-border, #efe7d7); }
    .accounts-table tbody tr:last-child { border-bottom: none; }
    .accounts-table tbody tr:hover { background: var(--color-surface-2, #faf6ee); }
    .acct-email { font-weight: 600; color: var(--color-primary, #16324F); }
    .acct-you { margin-left: var(--space-2); font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--color-accent, #B97E2C); }
    .acct-actions { text-align: right; white-space: nowrap; }
    .acct-actions .btn { margin-left: var(--space-2); }
    .acct-actions .btn:first-child { margin-left: 0; }
    /* Danger-tinted ghost button for the destructive "Deactivate" row action. */
    .btn-ghost.btn-danger { color: var(--color-danger, #B23B3B); }
    .btn-ghost.btn-danger:hover { background: rgba(178,59,59,.08); }
    /* Success-tinted ghost button for the "Reactivate" row action. */
    .btn-ghost.btn-ok { color: #2E7D50; }
    .btn-ghost.btn-ok:hover { background: rgba(46,125,80,.10); }
    /* Approve = filled success button so it reads as the primary next step. */
    .btn.btn-approve { background: #2E7D50; border-color: #2E7D50; color: #fff; }
    .btn.btn-approve:hover { background: #276b45; border-color: #276b45; }
    /* Access badges (approved / awaiting approval). */
    .badge-approved { background: rgba(46,125,80,.14); color: #2E7D50; }
    .badge-pending { background: rgba(185,126,44,.16); color: #8a5d13; }
    .accounts-empty, .accounts-loading, .accounts-error { padding: var(--space-6); text-align: center; color: var(--color-text-muted, #7A6A52); font-size: .9rem; }
    .accounts-error { color: var(--color-danger, #B23B3B); }
    .acct-role-cap { text-transform: capitalize; }

    /* Modal form niceties layered on the existing design-system modal. */
    .modal-form-note { font-size: .82rem; color: var(--color-text-muted, #7A6A52); margin: 0 0 var(--space-4); }
    .modal-alert {
      display: none; margin: 0 0 var(--space-4); padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md, 10px); font-size: .85rem;
      background: rgba(178,59,59,.08); color: var(--color-danger, #B23B3B);
      border: 1px solid rgba(178,59,59,.25);
    }
    .modal-alert.is-visible { display: block; }
    .modal { max-width: 30rem; }
    .modal-close .modal-close-ico { display: inline-flex; }
    .pw-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
    .pw-row .field-label { margin-bottom: var(--space-2); }

    /* ── Confirmation dialog (deactivate / reactivate / reset device) ───── */
    .confirm-body { display: flex; gap: var(--space-4); align-items: flex-start; }
    .confirm-ico {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
      width: 44px; height: 44px; border-radius: var(--radius-md, 10px);
      background: var(--color-primary-soft, #E9EFF5); color: var(--color-primary, #16324F);
    }
    .confirm-modal.is-danger .confirm-ico { background: rgba(178,59,59,.12); color: var(--color-danger, #B23B3B); }
    .confirm-copy { flex: 1 1 auto; }
    .confirm-copy p { margin: 0; color: var(--color-text-muted, #7A6A52); font-size: .9rem; }
    .confirm-copy .confirm-lead { color: var(--color-primary, #16324F); font-weight: 600; margin-bottom: var(--space-2); font-size: .95rem; }
    .confirm-target { font-weight: 600; color: var(--color-primary, #16324F); }
    /* Solid danger button for the confirm action when destructive. */
    .btn.btn-danger-solid { background: var(--color-danger, #B23B3B); border-color: var(--color-danger, #B23B3B); color: #fff; }
    .btn.btn-danger-solid:hover { background: #9c3232; border-color: #9c3232; }
    @media (max-width: 640px) {
      .accounts-table thead { display: none; }
      .accounts-table, .accounts-table tbody, .accounts-table tr, .accounts-table td { display: block; width: 100%; }
      .accounts-table tr { padding: var(--space-3) var(--space-4); }
      .accounts-table td { padding: var(--space-1) 0; }
      .acct-actions { text-align: left; margin-top: var(--space-2); }
    }
  </style>
</head>
<body>
  <div class="admin-shell">
    <header class="admin-bar">
      <a href="/" class="wordmark" aria-label="تيسير — home">تيسير</a>
      <span class="admin-tag">Admin</span>
      <span class="admin-who">Signed in as ${esc(adminEmail)}</span>
    </header>

    <main class="admin-main" id="admin-dashboard">
      <div class="admin-head">
        <p class="overline">Admin console</p>
        <h1>Dashboard</h1>
        <p>An at-a-glance overview of the subscriber base. These figures are computed on the server for administrators only.</p>
      </div>

      <section class="stat-grid" id="stats-overview" aria-label="Subscriber statistics">
        <article class="stat-card stat-card--total" id="stat-total-subscribers">
          <div class="stat-card-top">
            <span class="stat-icon">${usersIcon}</span>
            <span class="stat-label">Total subscribers</span>
          </div>
          <span class="stat-value" id="value-total-subscribers">${total}</span>
          <p class="stat-note">All accounts with the subscriber role, active or suspended.</p>
        </article>

        <article class="stat-card stat-card--active" id="stat-active-subscribers">
          <div class="stat-card-top">
            <span class="stat-icon">${activeIcon}</span>
            <span class="stat-label">Active subscribers</span>
          </div>
          <span class="stat-value" id="value-active-subscribers">${active}</span>
          <p class="stat-note">Subscribers whose account is currently active and can sign in.</p>
        </article>

        <article class="stat-card stat-card--pending" id="stat-pending-subscribers">
          <div class="stat-card-top">
            <span class="stat-icon">${pendingIcon}</span>
            <span class="stat-label">Awaiting approval</span>
          </div>
          <span class="stat-value" id="value-pending-subscribers">${pending}</span>
          <p class="stat-note">Signed-up accounts that can browse but whose files are still locked until you approve them.</p>
        </article>
      </section>

      <!-- ── Pending device requests (single-device binding) ──────────── -->
      <section class="devices-section" id="devices-section" aria-labelledby="devices-heading">
        <div class="devices-head">
          <p class="overline">Device access</p>
          <h2 id="devices-heading">${deviceIcon}<span>Pending device requests</span><span class="badge-devcount" id="devices-count" hidden>0</span></h2>
          <p>Each account is bound to a single device. When someone tries to sign in from a different device, the login is blocked and a request appears here. Approve it to make the new device the account's allowed device, or reject it to keep the old one. All checks run on the server.</p>
        </div>

        <div class="devices-card">
          <div class="devices-loading" id="devices-loading">Loading device requests…</div>
          <div class="devices-error" id="devices-error" hidden></div>
          <div class="devices-empty" id="devices-empty" hidden>No pending device requests.</div>
          <ul class="device-list" id="devices-list" hidden></ul>
        </div>
      </section>

      <!-- ── Accounts management (Task 9, Step 2/3) ───────────────────── -->
      <section class="accounts-section" id="accounts-section" aria-labelledby="accounts-heading">
        <div class="accounts-head">
          <div>
            <p class="overline">Accounts</p>
            <h2 id="accounts-heading">Manage accounts</h2>
            <p>Create new subscriber accounts and edit existing ones. All changes are validated and applied on the server.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-new-account">
            <span class="btn-ico">${plusIcon}</span>New subscriber
          </button>
        </div>

        <div class="accounts-card">
          <div class="accounts-loading" id="accounts-loading">Loading accounts…</div>
          <div class="accounts-error" id="accounts-error" hidden></div>
          <div class="accounts-empty" id="accounts-empty" hidden>No accounts yet. Create the first subscriber above.</div>
          <table class="accounts-table" id="accounts-table" hidden>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Access</th>
                <th scope="col">Created</th>
                <th scope="col" class="acct-actions">Actions</th>
              </tr>
            </thead>
            <tbody id="accounts-tbody"></tbody>
          </table>
        </div>
      </section>
    </main>
  </div>

  <!-- ── Create-account modal ──────────────────────────────────────────── -->
  <div class="modal-overlay" id="create-modal-overlay" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="create-modal-title">New subscriber</h2>
        <button type="button" class="modal-close" data-close-modal="create" aria-label="Close">
          <span class="modal-close-ico">${closeIcon}</span>
        </button>
      </div>
      <form id="create-form" novalidate>
        <div class="modal-body">
          <p class="modal-form-note">Create an account directly. Accounts made here are approved for full file access straight away. (Users can also sign up themselves — those start locked and appear below awaiting your approval.)</p>
          <div class="modal-alert" id="create-alert" role="alert"></div>

          <div class="field">
            <label class="field-label" for="create-email">Email</label>
            <input class="input" type="email" id="create-email" name="email" autocomplete="off" required placeholder="student@example.com" />
          </div>

          <div class="field">
            <label class="field-label" for="create-password">Password</label>
            <input class="input" type="password" id="create-password" name="password" autocomplete="new-password" required minlength="8" placeholder="At least 8 characters" />
            <p class="field-hint">Minimum 8 characters. It is hashed on the server (PBKDF2) — never stored in plain text.</p>
          </div>

          <div class="field">
            <label class="field-label" for="create-role">Role</label>
            <select class="select" id="create-role" name="role">
              <option value="subscriber" selected>Subscriber</option>
              <option value="admin">Admin</option>
            </select>
            <p class="field-hint">Subscribers can view the library. Admins can manage accounts.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-close-modal="create">Cancel</button>
          <button type="submit" class="btn btn-primary" id="create-submit">Create account</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Edit-account modal ────────────────────────────────────────────── -->
  <div class="modal-overlay" id="edit-modal-overlay" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="edit-modal-title">Edit account</h2>
        <button type="button" class="modal-close" data-close-modal="edit" aria-label="Close">
          <span class="modal-close-ico">${closeIcon}</span>
        </button>
      </div>
      <form id="edit-form" novalidate>
        <input type="hidden" id="edit-id" name="id" />
        <div class="modal-body">
          <p class="modal-form-note" id="edit-form-note">Update this account. Leave the password blank to keep the current one.</p>
          <div class="modal-alert" id="edit-alert" role="alert"></div>

          <div class="field">
            <label class="field-label" for="edit-email">Email</label>
            <input class="input" type="email" id="edit-email" name="email" autocomplete="off" required placeholder="student@example.com" />
          </div>

          <div class="field">
            <div class="pw-row">
              <label class="field-label" for="edit-password">New password</label>
            </div>
            <input class="input" type="password" id="edit-password" name="password" autocomplete="new-password" minlength="8" placeholder="Leave blank to keep unchanged" />
            <p class="field-hint">Optional. If set, all of this account's active sessions are revoked immediately.</p>
          </div>

          <div class="field">
            <label class="field-label" for="edit-role">Role</label>
            <select class="select" id="edit-role" name="role">
              <option value="subscriber">Subscriber</option>
              <option value="admin">Admin</option>
            </select>
            <p class="field-hint" id="edit-role-hint">Subscribers can view the library. Admins can manage accounts.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-close-modal="edit">Cancel</button>
          <button type="submit" class="btn btn-primary" id="edit-submit">Save changes</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Confirmation modal (deactivate / reactivate / reset device) ─────── -->
  <div class="modal-overlay" id="confirm-modal-overlay" role="presentation">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="confirm-modal-title">Please confirm</h2>
        <button type="button" class="modal-close" data-close-modal="confirm" aria-label="Close">
          <span class="modal-close-ico">${closeIcon}</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="modal-alert" id="confirm-alert" role="alert"></div>
        <div class="confirm-body">
          <span class="confirm-ico">${warnIcon}</span>
          <div class="confirm-copy">
            <p class="confirm-lead" id="confirm-lead">Are you sure?</p>
            <p id="confirm-detail"></p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-close-modal="confirm">Cancel</button>
        <button type="button" class="btn btn-primary" id="confirm-submit">Confirm</button>
      </div>
    </div>
  </div>

  <!-- The current admin's id, so the client can label their own row + guard
       self-demotion / self-deactivation in the UI (the server enforces it
       regardless). -->
  <script>window.__ADMIN_ID__ = ${JSON.stringify(adminId)};</script>
  <script src="/static/admin.js" defer></script>
</body>
</html>`
}
