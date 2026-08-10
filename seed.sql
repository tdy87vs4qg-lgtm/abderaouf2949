-- ============================================================================
-- تيسير — DEV/SAMPLE seed data (NOT production accounts)
--
-- These two rows exist ONLY to exercise the auth foundation locally. In
-- production, accounts are created by the admin dashboard (a later task);
-- there is no self-signup. Do NOT ship these credentials.
--
-- Passwords (dev only):
--   admin@bacyeswecan.dev    → AdminPass123!    (role: admin)
--   student@bacyeswecan.dev  → StudentPass123!  (role: subscriber)
--
-- Hashes are PBKDF2 (SHA-256, 210k iterations) in the exact encoded format
-- produced by src/lib/crypto.ts (pbkdf2$hash$iters$saltB64$keyB64).
-- ============================================================================

-- approved: 1 = full file access; 0 = locked (can browse, files gated).
INSERT OR IGNORE INTO users (id, email, email_lower, password_hash, role, status, approved) VALUES
  (
    '13a5b153-b5be-4e47-9587-68394d4b0c9a',
    'admin@bacyeswecan.dev',
    'admin@bacyeswecan.dev',
    'pbkdf2$SHA-256$210000$zZaQkAst8yXQ+EzE9GYFKg==$mKEEclFNwHbMtnCIrYYoErTJtxQh2j7moD0jgQWJ2Xs=',
    'admin',
    'active',
    1
  ),
  (
    'b5dcc934-0427-4e27-ab73-be224c487a75',
    'student@bacyeswecan.dev',
    'student@bacyeswecan.dev',
    'pbkdf2$SHA-256$210000$n7HMPlM+QuSxF7usbpf+Vg==$zIsla0F+O3XfeAE1tUGfB0IO333IbQ9ZSXkv9NqgM8I=',
    'subscriber',
    'active',
    1
  ),
  (
    'c7f0a2e1-3b4d-4c5a-9e8f-0a1b2c3d4e5f',
    'pending@bacyeswecan.dev',
    'pending@bacyeswecan.dev',
    'pbkdf2$SHA-256$210000$n7HMPlM+QuSxF7usbpf+Vg==$zIsla0F+O3XfeAE1tUGfB0IO333IbQ9ZSXkv9NqgM8I=',
    'subscriber',
    'active',
    0
  );
