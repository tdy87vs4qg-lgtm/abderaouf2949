import { useState } from 'react'

// ---------------------------------------------------------------------------
// GoogleSignInButton — the ONLY way into تيسير (STEP 3, UI ONLY)
//
// Clicking this sends the browser to the EXISTING backend route
// `GET /api/auth/google`, which mints the CSRF `state`, sets the httpOnly
// `bac_oauth_state` cookie and 302-redirects to Google's own consent screen.
// Google then asks the user to sign in / consent and returns them to
// `GET /api/auth/google/callback`, which finishes the login and issues the
// session. Because Google covers both signing in and account creation, this one
// button replaces the old "login" and "signup" forms.
//
// WHY A PLAIN <a> (top-level navigation) AND NOT fetch():
//   • The OAuth start route answers with a 302 to accounts.google.com. Only a
//     real, top-level browser navigation can follow that cross-origin redirect
//     and render Google's page — an XHR/fetch cannot.
//   • The `bac_oauth_state` cookie is SameSite=Lax. Lax cookies are sent on
//     top-level GET navigations, which is exactly how Google hands the browser
//     back to our callback. A fetch-based flow would not preserve it.
//   • `<a href>` is also correct for the router: react-router only intercepts
//     its own <Link>, so a plain anchor to an /api/* path performs a genuine
//     document navigation and never becomes an SPA route change.
//
// No credentials, tokens or client secrets are handled here — this component
// only navigates. It touches no session cookie, no backend route definition and
// no protected logic.
// ---------------------------------------------------------------------------

/** The existing OAuth start route (Part A). Must stay a top-level navigation. */
const GOOGLE_OAUTH_START = '/api/auth/google'

export default function GoogleSignInButton() {
  // Purely cosmetic: once the navigation is under way we swap the label and
  // disable further clicks so an impatient double-tap can't restart the flow
  // (which would mint a second `state` and invalidate the first).
  const [redirecting, setRedirecting] = useState(false)

  return (
    <a
      href={GOOGLE_OAUTH_START}
      className="google-signin-button"
      aria-label="سجّل الدخول بحساب Google"
      aria-disabled={redirecting || undefined}
      // `rel=external` documents that this leaves the SPA; `data-no-spa` is a
      // hint for any future link interceptor. Neither changes the navigation.
      rel="external nofollow"
      data-no-spa="true"
      onClick={(event) => {
        if (redirecting) {
          event.preventDefault()
          return
        }
        setRedirecting(true)
        // The anchor's own default action performs the navigation — we do NOT
        // preventDefault here, so the browser makes a normal top-level GET.
      }}
    >
      <GoogleGlyph />
      <span className="google-signin-button__label">
        {redirecting ? 'جارٍ التحويل إلى Google…' : 'سجّل الدخول بحساب Google'}
      </span>
    </a>
  )
}

/**
 * Google's four-colour "G" mark, drawn inline as SVG so the button needs no
 * network request and renders identically in the dark and light themes.
 * `dir="ltr"` keeps the glyph's own geometry unaffected by the RTL page.
 */
function GoogleGlyph() {
  return (
    <span className="google-signin-button__glyph" aria-hidden="true" dir="ltr">
      <svg width="20" height="20" viewBox="0 0 18 18" focusable="false">
        <path
          fill="#4285F4"
          d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
        />
        <path
          fill="#EA4335"
          d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
        />
      </svg>
    </span>
  )
}
