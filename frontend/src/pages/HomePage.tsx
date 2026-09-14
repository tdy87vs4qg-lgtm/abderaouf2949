// ─────────────────────────────────────────────────────────────────────────
// HomePage — the FIRST page of تيسير (route "/").
//
// Its entire previous design, markup, content and styling were deleted on
// purpose. This file is now an intentionally EMPTY page, ready for a brand
// new design to be built on top of it.
//
// NOTHING of the app's logic lives in this file and nothing was removed from
// it: Google login / OAuth, sessions, cookies, Google Drive, the Cloudflare
// Worker, D1/KV, secrets and wrangler config are all untouched and still fully
// wired up elsewhere:
//   • frontend/src/components/SiteHeader.tsx   → session-aware header
//   • frontend/src/lib/useSession.ts           → reads the server session
//   • frontend/src/components/AuthShell.tsx    → login / signup screens
//   • frontend/src/components/GoogleSignInButton.tsx
//   • src/lib/google-auth.ts, google-oauth.ts, google-oauth-callback.ts,
//     session.ts, guards.ts, drive.ts, users.ts
//   • src/routes/auth.ts  (/api/auth/*)
//
// The route itself stays registered in App.tsx, so "/" keeps rendering the
// authenticated shell (header + session state) — only its body is blank.
// ─────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return null
}
