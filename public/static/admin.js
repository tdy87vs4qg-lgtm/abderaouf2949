/* ============================================================================
 * تيسير — Admin console client logic — Task 9 (Step 3/3):
 *   CREATE & EDIT (Step 2) + DEACTIVATE / REACTIVATE / RESET DEVICE (Step 3)
 *
 * This script drives the account-management UI on /admin. It is intentionally
 * a thin client: it only renders the list and submits the admin's intent to
 * the SERVER-SIDE, admin-guarded endpoints. Every real decision — auth,
 * validation, email-uniqueness, password hashing, self-demotion guard,
 * self-deactivation guard, session revocation — happens on the server
 * (src/routes/admin.ts + src/lib/users.ts). Nothing here is trusted for
 * security; a tampered client simply gets a 4xx envelope back.
 *
 * Endpoints used (all same-origin, cookie-authenticated):
 *   GET   /api/admin/accounts                 → list all accounts
 *   POST  /api/admin/accounts                 → create a new account
 *   PATCH /api/admin/accounts/:id             → edit email / password / role
 *   POST  /api/admin/accounts/:id/deactivate  → suspend + revoke all sessions
 *   POST  /api/admin/accounts/:id/reactivate  → re-enable login
 *   POST  /api/admin/accounts/:id/reset-device→ revoke all sessions (no suspend)
 * ==========================================================================*/
(function () {
  'use strict';

  var ADMIN_ID = window.__ADMIN_ID__ || '';

  // ── Element handles ───────────────────────────────────────────────────
  var els = {
    tbody: document.getElementById('accounts-tbody'),
    table: document.getElementById('accounts-table'),
    loading: document.getElementById('accounts-loading'),
    error: document.getElementById('accounts-error'),
    empty: document.getElementById('accounts-empty'),
    newBtn: document.getElementById('btn-new-account'),
    statTotal: document.getElementById('value-total-subscribers'),
    statActive: document.getElementById('value-active-subscribers'),
    statPending: document.getElementById('value-pending-subscribers'),

    // pending device requests
    devicesList: document.getElementById('devices-list'),
    devicesLoading: document.getElementById('devices-loading'),
    devicesError: document.getElementById('devices-error'),
    devicesEmpty: document.getElementById('devices-empty'),
    devicesCount: document.getElementById('devices-count'),

    // create modal
    createOverlay: document.getElementById('create-modal-overlay'),
    createForm: document.getElementById('create-form'),
    createEmail: document.getElementById('create-email'),
    createPassword: document.getElementById('create-password'),
    createRole: document.getElementById('create-role'),
    createAlert: document.getElementById('create-alert'),
    createSubmit: document.getElementById('create-submit'),

    // edit modal
    editOverlay: document.getElementById('edit-modal-overlay'),
    editForm: document.getElementById('edit-form'),
    editId: document.getElementById('edit-id'),
    editEmail: document.getElementById('edit-email'),
    editPassword: document.getElementById('edit-password'),
    editRole: document.getElementById('edit-role'),
    editRoleHint: document.getElementById('edit-role-hint'),
    editAlert: document.getElementById('edit-alert'),
    editSubmit: document.getElementById('edit-submit'),

    // confirm modal (deactivate / reactivate / reset device)
    confirmOverlay: document.getElementById('confirm-modal-overlay'),
    confirmModal: document.querySelector('#confirm-modal-overlay .confirm-modal'),
    confirmTitle: document.getElementById('confirm-modal-title'),
    confirmLead: document.getElementById('confirm-lead'),
    confirmDetail: document.getElementById('confirm-detail'),
    confirmAlert: document.getElementById('confirm-alert'),
    confirmSubmit: document.getElementById('confirm-submit')
  };

  // ── Small helpers ─────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    try {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function statusBadge(status) {
    if (status === 'active') return '<span class="badge badge-success">Active</span>';
    if (status === 'suspended') return '<span class="badge badge-warning">Suspended</span>';
    return '<span class="badge">' + esc(status) + '</span>';
  }

  function roleBadge(role) {
    if (role === 'admin') return '<span class="badge badge-primary acct-role-cap">admin</span>';
    return '<span class="badge acct-role-cap">subscriber</span>';
  }

  // Access badge: admins are always entitled; subscribers are either approved
  // (full file access) or awaiting approval (can browse, files locked).
  function accessBadge(acct) {
    if (acct.role === 'admin') return '<span class="badge badge-approved">Full access</span>';
    if (acct.approved) return '<span class="badge badge-approved">Approved</span>';
    return '<span class="badge badge-pending">Awaiting approval</span>';
  }

  function showAlert(el, msg) {
    el.textContent = msg;
    el.classList.add('is-visible');
  }
  function clearAlert(el) {
    el.textContent = '';
    el.classList.remove('is-visible');
  }

  // ── Modal open / close ────────────────────────────────────────────────
  var overlays = { create: els.createOverlay, edit: els.editOverlay, confirm: els.confirmOverlay };

  function openModal(name) {
    var ov = overlays[name];
    if (!ov) return;
    ov.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    // Focus the first field for keyboard users.
    var first = ov.querySelector('input, select, textarea');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }

  function closeModal(name) {
    var ov = overlays[name];
    if (!ov) return;
    ov.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // Close via the × / Cancel buttons (delegated).
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-close-modal]') : null;
    if (t) {
      e.preventDefault();
      closeModal(t.getAttribute('data-close-modal'));
    }
  });

  // Close when clicking the dimmed backdrop (but not the dialog itself).
  Object.keys(overlays).forEach(function (name) {
    var ov = overlays[name];
    if (!ov) return;
    ov.addEventListener('mousedown', function (e) {
      if (e.target === ov) closeModal(name);
    });
  });

  // Esc closes whichever modal is open.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      Object.keys(overlays).forEach(function (name) {
        if (overlays[name] && overlays[name].classList.contains('is-open')) closeModal(name);
      });
    }
  });

  // ── Data fetch + render ───────────────────────────────────────────────
  function setPanel(state) {
    // state: 'loading' | 'error' | 'empty' | 'table'
    els.loading.hidden = state !== 'loading';
    els.error.hidden = state !== 'error';
    els.empty.hidden = state !== 'empty';
    els.table.hidden = state !== 'table';
  }

  function renderRows(accounts) {
    var html = accounts.map(function (a) {
      var isSelf = a.id === ADMIN_ID;
      var you = isSelf ? '<span class="acct-you">You</span>' : '';

      // Per-row action buttons. The server independently re-authorises and
      // re-checks every one of these (incl. the self-guards); the UI just
      // hides the ones that would always be rejected for the current admin.
      //
      // LABELLING RULE (why the wording below is what it is):
      //   • SUBSCRIPTION access  → /approve + /unapprove  (writes users.approved)
      //     This is the ONLY pair that unlocks / re-locks the files, because the
      //     paywall checks `approved` and nothing else.
      //     → "تفعيل الاشتراك" / "إيقاف الاشتراك".
      //   • LOGIN access        → /reactivate + /deactivate (writes users.status)
      //     This only controls whether the person can SIGN IN. It never unlocks
      //     a single file. → "استعادة الدخول" / "إيقاف الدخول".
      // The two pairs must never read alike; that ambiguity is the bug this
      // wording fixes. Endpoints, payloads and DB columns are untouched.
      var actions = '';

      // ── Subscription (file access) — the control that ACTUALLY unlocks ────
      // Always rendered, for every row, so the admin can find and use the same
      // control in the same place — including on their own row while testing.
      // (Admins are entitled by role anyway, so we say so in the tooltip rather
      // than hiding the button and leaving the admin hunting for it.)
      var adminNote = a.role === 'admin'
        ? ' — المشرف يملك وصولاً كاملاً بحكم دوره'
        : '';
      if (a.approved) {
        actions +=
          '<button type="button" lang="ar" dir="rtl"' +
          ' title="إيقاف الاشتراك: إعادة قفل جميع الملفات. لا يزال بإمكانه تسجيل الدخول.' + adminNote + '"' +
          ' aria-label="إيقاف الاشتراك — إعادة قفل الملفات"' +
          ' class="btn btn-ghost btn-danger btn-sm js-unapprove">إيقاف الاشتراك</button>';
      } else {
        actions +=
          '<button type="button" lang="ar" dir="rtl"' +
          ' title="تفعيل الاشتراك: فتح جميع الملفات لهذا الحساب فوراً.' + adminNote + '"' +
          ' aria-label="تفعيل الاشتراك — فتح جميع الملفات"' +
          ' class="btn btn-approve btn-sm js-approve">تفعيل الاشتراك</button>';
      }

      actions += '<button type="button" class="btn btn-ghost btn-sm js-edit">Edit</button>';

      // Reset device: sign the account out of every device WITHOUT suspending.
      // Hidden for your own row (you'd immediately log yourself out).
      if (!isSelf) {
        actions +=
          '<button type="button" class="btn btn-ghost btn-sm js-reset-device">Reset device</button>';
      }

      // ── Login access (does NOT unlock files) ──────────────────────────────
      // Deactivate / Reactivate toggle. You cannot deactivate yourself (server
      // returns CANNOT_SUSPEND_SELF), so that control is hidden on your row.
      if (a.status === 'active') {
        if (!isSelf) {
          actions +=
            '<button type="button" lang="ar" dir="rtl"' +
            ' title="إيقاف الدخول: منع تسجيل الدخول وإنهاء الجلسات. لا علاقة له بتفعيل الاشتراك."' +
            ' aria-label="إيقاف الدخول — منع تسجيل الدخول فقط"' +
            ' class="btn btn-ghost btn-danger btn-sm js-deactivate">إيقاف الدخول</button>';
        }
      } else {
        actions +=
          '<button type="button" lang="ar" dir="rtl"' +
          ' title="استعادة الدخول: السماح بتسجيل الدخول مجدداً. لا يفتح الملفات — استخدم «تفعيل الاشتراك» لذلك."' +
          ' aria-label="استعادة الدخول — لا يفتح الملفات"' +
          ' class="btn btn-ghost btn-ok btn-sm js-reactivate">استعادة الدخول</button>';
      }

      return (
        '<tr data-id="' + esc(a.id) + '">' +
          '<td data-label="Email"><span class="acct-email">' + esc(a.email) + '</span>' + you + '</td>' +
          '<td data-label="Role">' + roleBadge(a.role) + '</td>' +
          '<td data-label="Status">' + statusBadge(a.status) + '</td>' +
          '<td data-label="Access">' + accessBadge(a) + '</td>' +
          '<td data-label="Created">' + fmtDate(a.createdAt) + '</td>' +
          '<td class="acct-actions">' + actions + '</td>' +
        '</tr>'
      );
    }).join('');
    els.tbody.innerHTML = html;
  }

  // Keep the two stat cards in sync after any create/edit so the numbers never
  // go stale without a reload. Recomputed from the freshly-fetched list.
  function refreshStats(accounts) {
    var total = 0, active = 0, pending = 0;
    accounts.forEach(function (a) {
      if (a.role === 'subscriber') {
        total += 1;
        if (a.status === 'active') active += 1;
        if (!a.approved) pending += 1;
      }
    });
    if (els.statTotal) els.statTotal.textContent = String(total);
    if (els.statActive) els.statActive.textContent = String(active);
    if (els.statPending) els.statPending.textContent = String(pending);
  }

  var accountsCache = [];

  function loadAccounts() {
    setPanel('loading');
    return fetch('/api/admin/accounts', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
      .then(function (res) {
        if (!res.r.ok || !res.b || res.b.ok !== true) {
          var msg = (res.b && res.b.message) || 'Could not load accounts (' + res.r.status + ').';
          els.error.textContent = msg;
          setPanel('error');
          return;
        }
        accountsCache = Array.isArray(res.b.accounts) ? res.b.accounts : [];
        refreshStats(accountsCache);
        if (accountsCache.length === 0) {
          setPanel('empty');
        } else {
          renderRows(accountsCache);
          setPanel('table');
        }
      })
      .catch(function () {
        els.error.textContent = 'Network error while loading accounts.';
        setPanel('error');
      });
  }

  // ── Create flow ───────────────────────────────────────────────────────
  els.newBtn.addEventListener('click', function () {
    els.createForm.reset();
    els.createRole.value = 'subscriber';
    clearAlert(els.createAlert);
    openModal('create');
  });

  els.createForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAlert(els.createAlert);

    var email = els.createEmail.value.trim();
    var password = els.createPassword.value;
    var role = els.createRole.value;

    if (!email) { showAlert(els.createAlert, 'An email address is required.'); return; }
    if (password.length < 8) { showAlert(els.createAlert, 'Password must be at least 8 characters.'); return; }

    els.createSubmit.disabled = true;
    var original = els.createSubmit.textContent;
    els.createSubmit.textContent = 'Creating…';

    fetch('/api/admin/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, role: role })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
      .then(function (res) {
        if (res.r.status === 201 && res.b && res.b.ok) {
          closeModal('create');
          loadAccounts();
        } else {
          showAlert(els.createAlert, (res.b && res.b.message) || 'Could not create the account.');
        }
      })
      .catch(function () {
        showAlert(els.createAlert, 'Network error — please try again.');
      })
      .then(function () {
        els.createSubmit.disabled = false;
        els.createSubmit.textContent = original;
      });
  });

  // ── Row actions (delegated so they work for rows added after load) ──────
  // Edit → opens the edit modal. Deactivate / Reactivate / Reset device →
  // open the shared confirmation dialog, which fires the matching endpoint.
  els.tbody.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var tr = e.target.closest('tr');
    if (!tr) return;
    var id = tr.getAttribute('data-id');
    var acct = accountsCache.filter(function (a) { return a.id === id; })[0];
    if (!acct) return;

    if (e.target.closest('.js-edit')) {
      openEdit(acct);
    } else if (e.target.closest('.js-approve')) {
      openConfirm('approve', acct);
    } else if (e.target.closest('.js-unapprove')) {
      openConfirm('unapprove', acct);
    } else if (e.target.closest('.js-deactivate')) {
      openConfirm('deactivate', acct);
    } else if (e.target.closest('.js-reactivate')) {
      openConfirm('reactivate', acct);
    } else if (e.target.closest('.js-reset-device')) {
      openConfirm('reset-device', acct);
    }
  });

  function openEdit(acct) {
    clearAlert(els.editAlert);
    els.editForm.reset();
    els.editId.value = acct.id;
    els.editEmail.value = acct.email;
    els.editPassword.value = '';
    els.editRole.value = acct.role;

    // Soft self-demotion guard in the UI (server enforces CANNOT_DEMOTE_SELF
    // regardless). If editing your own admin account, lock the role select.
    var isSelfAdmin = acct.id === ADMIN_ID && acct.role === 'admin';
    els.editRole.disabled = isSelfAdmin;
    els.editRoleHint.textContent = isSelfAdmin
      ? 'You cannot remove your own admin role.'
      : 'Subscribers can view the library. Admins can manage accounts.';

    openModal('edit');
  }

  els.editForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAlert(els.editAlert);

    var id = els.editId.value;
    var acct = accountsCache.filter(function (a) { return a.id === id; })[0] || {};

    var email = els.editEmail.value.trim();
    var password = els.editPassword.value;
    var role = els.editRole.disabled ? acct.role : els.editRole.value;

    if (!email) { showAlert(els.editAlert, 'An email address is required.'); return; }
    if (password && password.length < 8) {
      showAlert(els.editAlert, 'New password must be at least 8 characters.');
      return;
    }

    // Only send fields that actually changed → the PATCH endpoint treats
    // undefined fields as "leave unchanged" and rejects an empty diff with
    // NOTHING_TO_UPDATE, which we surface as a friendly message.
    var payload = {};
    if (email !== acct.email) payload.email = email;
    if (password) payload.password = password;
    if (role !== acct.role) payload.role = role;

    if (Object.keys(payload).length === 0) {
      showAlert(els.editAlert, 'No changes to save.');
      return;
    }

    els.editSubmit.disabled = true;
    var original = els.editSubmit.textContent;
    els.editSubmit.textContent = 'Saving…';

    fetch('/api/admin/accounts/' + encodeURIComponent(id), {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
      .then(function (res) {
        if (res.r.ok && res.b && res.b.ok) {
          closeModal('edit');
          loadAccounts();
        } else {
          showAlert(els.editAlert, (res.b && res.b.message) || 'Could not save the changes.');
        }
      })
      .catch(function () {
        showAlert(els.editAlert, 'Network error — please try again.');
      })
      .then(function () {
        els.editSubmit.disabled = false;
        els.editSubmit.textContent = original;
      });
  });

  // ── Confirm flow (deactivate / reactivate / reset device) ──────────────
  // A single confirmation dialog serves all three account actions. Each has
  // its own copy, endpoint, whether it is "destructive" (red styling), and the
  // label shown on the confirm button.
  var CONFIRM_ACTIONS = {
    // SUBSCRIPTION pair → /approve + /unapprove → users.approved → the paywall.
    'approve': {
      title: 'تفعيل الاشتراك',
      lead: 'تفعيل الاشتراك وفتح جميع الملفات لهذا الحساب؟',
      detail: function (a) {
        return 'سيتم فتح جميع الملفات فوراً لـ ' + '<span class="confirm-target">' + esc(a.email) + '</span>' +
          '. يحتفظ بتسجيل دخوله ولا يحتاج إلى إعادة تسجيل الدخول. (هذا هو الزر الذي يفتح المحتوى فعلياً.)';
      },
      endpoint: function (a) { return '/api/admin/accounts/' + encodeURIComponent(a.id) + '/approve'; },
      confirmLabel: 'تفعيل الاشتراك',
      pendingLabel: 'جارٍ التفعيل…',
      danger: false
    },
    'unapprove': {
      title: 'إيقاف الاشتراك',
      lead: 'إيقاف الاشتراك وإعادة قفل الملفات؟',
      detail: function (a) {
        return 'سيتم إعادة قفل جميع الملفات لـ ' + '<span class="confirm-target">' + esc(a.email) + '</span>' +
          '. يبقى مسجّل الدخول ويمكنه التصفح، لكن الملفات ستظهر نافذة التواصل مجدداً حتى تُفعّل اشتراكه من جديد.';
      },
      endpoint: function (a) { return '/api/admin/accounts/' + encodeURIComponent(a.id) + '/unapprove'; },
      confirmLabel: 'إيقاف الاشتراك',
      pendingLabel: 'جارٍ الإيقاف…',
      danger: true
    },
    // LOGIN pair → /deactivate + /reactivate → users.status → sign-in only.
    'deactivate': {
      title: 'إيقاف الدخول',
      lead: 'منع هذا الحساب من تسجيل الدخول؟',
      detail: function (a) {
        return 'سيتم تعليق ' + '<span class="confirm-target">' + esc(a.email) + '</span>' +
          ' وتسجيل خروجه من جميع الأجهزة فوراً، ولن يتمكن من تسجيل الدخول حتى تستعيد دخوله. ' +
          'هذا لا يغيّر حالة الاشتراك — لإيقاف المحتوى استخدم «إيقاف الاشتراك».';
      },
      endpoint: function (a) { return '/api/admin/accounts/' + encodeURIComponent(a.id) + '/deactivate'; },
      confirmLabel: 'إيقاف الدخول',
      pendingLabel: 'جارٍ الإيقاف…',
      danger: true
    },
    'reactivate': {
      title: 'استعادة الدخول',
      lead: 'السماح لهذا الحساب بتسجيل الدخول مجدداً؟',
      detail: function (a) {
        return 'سيتمكن ' + '<span class="confirm-target">' + esc(a.email) + '</span>' +
          ' من تسجيل الدخول مرة أخرى على جهاز جديد (الجلسات السابقة أُلغيت). ' +
          'تنبيه: هذا لا يفتح الملفات — لفتح المحتوى استخدم زر «تفعيل الاشتراك».';
      },
      endpoint: function (a) { return '/api/admin/accounts/' + encodeURIComponent(a.id) + '/reactivate'; },
      confirmLabel: 'استعادة الدخول',
      pendingLabel: 'جارٍ الاستعادة…',
      danger: false
    },
    'reset-device': {
      title: 'Reset device',
      lead: 'Reset this account\u2019s device?',
      detail: function (a) {
        return 'This signs ' + '<span class="confirm-target">' + esc(a.email) + '</span>' +
          ' out of every device WITHOUT deactivating the account. They stay active and can sign in again on a new device. Use this when someone has switched phones or laptops.';
      },
      endpoint: function (a) { return '/api/admin/accounts/' + encodeURIComponent(a.id) + '/reset-device'; },
      confirmLabel: 'Reset device',
      pendingLabel: 'Resetting…',
      danger: false
    }
  };

  var pendingConfirm = null; // { action: string, acct: object }

  function openConfirm(action, acct) {
    var cfg = CONFIRM_ACTIONS[action];
    if (!cfg) return;
    pendingConfirm = { action: action, acct: acct };

    clearAlert(els.confirmAlert);
    if (els.confirmTitle) els.confirmTitle.textContent = cfg.title;
    if (els.confirmLead) els.confirmLead.textContent = cfg.lead;
    if (els.confirmDetail) els.confirmDetail.innerHTML = cfg.detail(acct);

    // Destructive actions get red styling on both the dialog accent and button.
    if (els.confirmModal) {
      els.confirmModal.classList.toggle('is-danger', !!cfg.danger);
    }
    if (els.confirmSubmit) {
      els.confirmSubmit.textContent = cfg.confirmLabel;
      els.confirmSubmit.classList.toggle('btn-danger-solid', !!cfg.danger);
      els.confirmSubmit.classList.toggle('btn-primary', !cfg.danger);
      els.confirmSubmit.disabled = false;
    }

    openModal('confirm');
  }

  if (els.confirmSubmit) {
    els.confirmSubmit.addEventListener('click', function () {
      if (!pendingConfirm) return;
      var action = pendingConfirm.action;
      var acct = pendingConfirm.acct;
      var cfg = CONFIRM_ACTIONS[action];
      if (!cfg) return;

      clearAlert(els.confirmAlert);
      els.confirmSubmit.disabled = true;
      var original = els.confirmSubmit.textContent;
      els.confirmSubmit.textContent = cfg.pendingLabel;

      fetch(cfg.endpoint(acct), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
        .then(function (res) {
          if (res.r.ok && res.b && res.b.ok) {
            pendingConfirm = null;
            closeModal('confirm');
            loadAccounts();
          } else {
            showAlert(els.confirmAlert, (res.b && res.b.message) || 'Could not complete that action.');
          }
        })
        .catch(function () {
          showAlert(els.confirmAlert, 'Network error — please try again.');
        })
        .then(function () {
          els.confirmSubmit.disabled = false;
          els.confirmSubmit.textContent = original;
        });
    });
  }

  // ── Pending device requests ────────────────────────────────────────────
  // Each account is bound to a single device server-side. A blocked login from
  // a new device creates a pending request; here the admin lists them and
  // Approves (rebind to the new device) or Rejects (keep the old device). Every
  // action re-authorises + re-validates on the server.
  function setDevicePanel(state) {
    // state: 'loading' | 'error' | 'empty' | 'list'
    if (els.devicesLoading) els.devicesLoading.hidden = state !== 'loading';
    if (els.devicesError) els.devicesError.hidden = state !== 'error';
    if (els.devicesEmpty) els.devicesEmpty.hidden = state !== 'empty';
    if (els.devicesList) els.devicesList.hidden = state !== 'list';
  }

  function setDeviceCount(n) {
    if (!els.devicesCount) return;
    if (n > 0) {
      els.devicesCount.textContent = String(n);
      els.devicesCount.hidden = false;
    } else {
      els.devicesCount.hidden = true;
    }
  }

  function renderDeviceRequests(requests) {
    var html = requests.map(function (req) {
      return (
        '<li class="device-row" data-id="' + esc(req.id) + '">' +
          '<div class="device-main">' +
            '<div class="device-email">' + esc(req.email) + '</div>' +
            '<div class="device-info">' + esc(req.deviceInfo || 'Unknown device') + '</div>' +
            '<div class="device-time">' + fmtDate(req.createdAt) + '</div>' +
          '</div>' +
          '<div class="device-actions">' +
            '<button type="button" class="btn btn-approve btn-sm js-dev-approve">Approve</button>' +
            '<button type="button" class="btn btn-ghost btn-danger btn-sm js-dev-reject">Reject</button>' +
          '</div>' +
        '</li>'
      );
    }).join('');
    if (els.devicesList) els.devicesList.innerHTML = html;
  }

  function loadDeviceRequests() {
    setDevicePanel('loading');
    return fetch('/api/admin/device-requests', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
      .then(function (res) {
        if (!res.r.ok || !res.b || res.b.ok !== true) {
          var msg = (res.b && res.b.message) || 'Could not load device requests (' + res.r.status + ').';
          if (els.devicesError) els.devicesError.textContent = msg;
          setDevicePanel('error');
          setDeviceCount(0);
          return;
        }
        var requests = Array.isArray(res.b.requests) ? res.b.requests : [];
        setDeviceCount(requests.length);
        if (requests.length === 0) {
          setDevicePanel('empty');
        } else {
          renderDeviceRequests(requests);
          setDevicePanel('list');
        }
      })
      .catch(function () {
        if (els.devicesError) els.devicesError.textContent = 'Network error while loading device requests.';
        setDevicePanel('error');
        setDeviceCount(0);
      });
  }

  if (els.devicesList) {
    els.devicesList.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var row = e.target.closest('.device-row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      var isApprove = !!e.target.closest('.js-dev-approve');
      var isReject = !!e.target.closest('.js-dev-reject');
      if (!isApprove && !isReject) return;

      var action = isApprove ? 'approve' : 'reject';
      var buttons = row.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;

      fetch('/api/admin/device-requests/' + encodeURIComponent(id) + '/' + action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
        .then(function (res) {
          if (res.r.ok && res.b && res.b.ok) {
            // Approving may unblock a login → refresh both lists.
            loadDeviceRequests();
            if (action === 'approve') loadAccounts();
          } else {
            for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
            if (els.devicesError) {
              els.devicesError.textContent = (res.b && res.b.message) || 'Could not complete that action.';
              els.devicesError.hidden = false;
            }
          }
        })
        .catch(function () {
          for (var k = 0; k < buttons.length; k++) buttons[k].disabled = false;
          if (els.devicesError) {
            els.devicesError.textContent = 'Network error — please try again.';
            els.devicesError.hidden = false;
          }
        });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────
  loadAccounts();
  loadDeviceRequests();
})();
