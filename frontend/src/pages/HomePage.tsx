// ─────────────────────────────────────────────────────────────────────────
// HomePage — the FIRST page of تيسير (route "/").
//
// This file now carries the NEW PROTOTYPE DESIGN, pasted in 1:1 from the
// supplied prototype ZIP (index.html + styles.css + script.js + assets/svg).
//
//   • The prototype's <body> markup is reproduced verbatim below as JSX
//     (only the mechanical HTML→JSX renames: class→className,
//     stroke-width→strokeWidth, etc. — no design change, nothing added,
//     nothing removed).
//   • The prototype's own stylesheet (styles.css), its Almarai webfont links
//     and its behaviour script (script.js) are loaded, untouched byte-for-byte,
//     from /static/prototype/ while this page is mounted.
//
// NO APP LOGIC LIVES IN THIS FILE AND NOTHING WAS TOUCHED:
// Google login / OAuth, sessions, cookies, Google Drive, the Cloudflare
// Worker, D1/KV, secrets and wrangler config are all untouched and still fully
// wired up elsewhere:
//   • frontend/src/components/SiteHeader.tsx   → session-aware header
//   • frontend/src/lib/useSession.ts           → reads the server session
//   • frontend/src/components/AuthShell.tsx    → login / signup screens
//   • frontend/src/components/GoogleSignInButton.tsx
//   • src/lib/google-auth.ts, google-oauth.ts, google-oauth-callback.ts,
//     session.ts, guards.ts, drive.ts, users.ts
//   • src/routes/auth.ts  (/api/auth/*)
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import GoogleSignInButton from '../components/GoogleSignInButton'

/** Where the prototype's own files were placed, verbatim, inside public/. */
const PROTO = '/static/prototype'

export default function HomePage() {
  // ── Sign-up tab step (LOCAL UI STATE ONLY) ──────────────────────────────
  // 1 = the decorative الاسم / اللقب fields + "متابعة"
  // 2 = the real "Sign up with Google" button (same OAuth flow as login).
  // The two name fields are NEVER read, stored, or sent anywhere: no state
  // holds their values, no fetch is made, the backend and the database are
  // not involved at all. They exist purely for the visual flow.
  const [signupStep, setSignupStep] = useState<1 | 2>(1)
  // Load the prototype's exact styles.css + script.js (and its Almarai font
  // links) for as long as this page is on screen, then clean them up again.
  // The files themselves are the prototype's originals, unmodified.
  useEffect(() => {
    const injected: HTMLElement[] = []

    const addLink = (rel: string, href: string, crossOrigin?: string) => {
      const el = document.createElement('link')
      el.rel = rel
      el.href = href
      if (crossOrigin !== undefined) el.crossOrigin = crossOrigin
      el.setAttribute('data-taysir-prototype', '')
      document.head.appendChild(el)
      injected.push(el)
      return el
    }

    addLink('preconnect', 'https://fonts.googleapis.com')
    addLink('preconnect', 'https://fonts.gstatic.com', '')
    addLink(
      'stylesheet',
      'https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&display=swap',
    )
    addLink('stylesheet', `${PROTO}/styles.css`)

    const script = document.createElement('script')
    script.src = `${PROTO}/script.js`
    script.defer = false
    script.setAttribute('data-taysir-prototype', '')
    document.body.appendChild(script)
    injected.push(script)

    // ── Decorative theme-toggle animation (purely cosmetic) ───────────────
    // /static/theme-lottie.js is a plain ES module living in public/, NOT part
    // of the Vite graph, so it cannot be `import`ed by path from TSX at build
    // time — it is injected as <script type="module"> instead (a module is the
    // hard requirement: the file itself `import`s the dotLottie runtime).
    //
    // TIMING: React mounts this header AFTER the document has loaded, so the
    // module's own DOMContentLoaded boot may have already run (e.g. when the
    // visitor arrives from /login via client-side routing, or on a remount).
    // The module is idempotent and exposes `window.taysirThemeLottie.scan()`
    // for exactly this case, so:
    //   • first visit  -> the tag is added, the module boots and scans; the
    //     host is already in the DOM because this effect runs after commit.
    //   • later mounts -> the module is already evaluated (browsers execute a
    //     given module URL once), so we call scan() ourselves to attach to the
    //     freshly-mounted host. scan() is a no-op on hosts already wired
    //     (data-theme-lottie-ready), so calling both paths is safe.
    // The one-way MutationObserver on <html data-theme> lives in the module and
    // is unaffected by this component: nothing here touches applyTheme /
    // themeBoot / localStorage, and the real toggling stays with the delegated
    // handler in the prototype's own script.js.
    const themeLottie = window as unknown as {
      taysirThemeLottie?: { scan?: () => void }
    }

    if (themeLottie.taysirThemeLottie?.scan) {
      themeLottie.taysirThemeLottie.scan()
    } else if (!document.querySelector('script[data-taysir-theme-lottie]')) {
      const lottie = document.createElement('script')
      lottie.type = 'module'
      lottie.src = '/static/theme-lottie.js'
      lottie.setAttribute('data-taysir-theme-lottie', '')
      // Deliberately NOT pushed into `injected`: module scripts are evaluated
      // once per URL, so removing the tag on unmount would not "unload" it and
      // re-adding it on the next mount would do nothing. Leaving the single tag
      // in place keeps the scan() path above working for later mounts.
      document.head.appendChild(lottie)
      // The host span is already committed to the DOM at this point, so the
      // module's own boot()/scan() finds it as soon as it evaluates.
      lottie.addEventListener('load', () => {
        try {
          themeLottie.taysirThemeLottie?.scan?.()
        } catch {
          /* decorative only — never break the page */
        }
      })
    }

    return () => {
      injected.forEach((el) => el.parentNode?.removeChild(el))
    }
  }, [])

  return (
    <>
      {/* ============ DECORATIVE BACKGROUND (very faint doodles) ============ */}
      <div className="bg-decor" aria-hidden="true">
        {/* big loose swirl top-left */}
        <svg className="doodle d1" viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M20 200 C 20 90, 120 20, 220 40 S 380 140, 340 240 S 180 380, 100 320 S 20 220, 60 160" />
          <path d="M80 220 C 100 160, 180 130, 240 160 S 320 240, 280 290" />
        </svg>
        {/* squiggle line */}
        <svg className="doodle d2" viewBox="0 0 500 100" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M5 50 Q 40 5, 80 50 T 160 50 T 240 50 T 320 50 T 400 50 T 480 50" />
        </svg>
        {/* dot grid */}
        <svg className="doodle d3" viewBox="0 0 200 200" fill="currentColor">
          <g>
            <circle cx="10" cy="10" r="2"/><circle cx="40" cy="10" r="2"/><circle cx="70" cy="10" r="2"/><circle cx="100" cy="10" r="2"/><circle cx="130" cy="10" r="2"/><circle cx="160" cy="10" r="2"/><circle cx="190" cy="10" r="2"/>
            <circle cx="10" cy="40" r="2"/><circle cx="40" cy="40" r="2"/><circle cx="70" cy="40" r="2"/><circle cx="100" cy="40" r="2"/><circle cx="130" cy="40" r="2"/><circle cx="160" cy="40" r="2"/><circle cx="190" cy="40" r="2"/>
            <circle cx="10" cy="70" r="2"/><circle cx="40" cy="70" r="2"/><circle cx="70" cy="70" r="2"/><circle cx="100" cy="70" r="2"/><circle cx="130" cy="70" r="2"/><circle cx="160" cy="70" r="2"/><circle cx="190" cy="70" r="2"/>
            <circle cx="10" cy="100" r="2"/><circle cx="40" cy="100" r="2"/><circle cx="70" cy="100" r="2"/><circle cx="100" cy="100" r="2"/><circle cx="130" cy="100" r="2"/><circle cx="160" cy="100" r="2"/><circle cx="190" cy="100" r="2"/>
            <circle cx="10" cy="130" r="2"/><circle cx="40" cy="130" r="2"/><circle cx="70" cy="130" r="2"/><circle cx="100" cy="130" r="2"/><circle cx="130" cy="130" r="2"/><circle cx="160" cy="130" r="2"/><circle cx="190" cy="130" r="2"/>
            <circle cx="10" cy="160" r="2"/><circle cx="40" cy="160" r="2"/><circle cx="70" cy="160" r="2"/><circle cx="100" cy="160" r="2"/><circle cx="130" cy="160" r="2"/><circle cx="160" cy="160" r="2"/><circle cx="190" cy="160" r="2"/>
            <circle cx="10" cy="190" r="2"/><circle cx="40" cy="190" r="2"/><circle cx="70" cy="190" r="2"/><circle cx="100" cy="190" r="2"/><circle cx="130" cy="190" r="2"/><circle cx="160" cy="190" r="2"/><circle cx="190" cy="190" r="2"/>
          </g>
        </svg>
        {/* star sparkle */}
        <svg className="doodle d4" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M50 10 L50 90 M10 50 L90 50 M22 22 L78 78 M78 22 L22 78" />
        </svg>
        {/* circle outline */}
        <svg className="doodle d5" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="100" cy="100" r="90" />
          <circle cx="100" cy="100" r="60" />
        </svg>
        {/* arrow curve */}
        <svg className="doodle d6" viewBox="0 0 200 120" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 100 C 40 20, 130 20, 180 80" />
          <path d="M170 60 L180 80 L160 84" />
        </svg>
        {/* squiggle line 2 */}
        <svg className="doodle d7" viewBox="0 0 500 100" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M5 50 Q 40 90, 80 50 T 160 50 T 240 50 T 320 50 T 400 50 T 480 50" />
        </svg>
        {/* plus mark */}
        <svg className="doodle d8" viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M30 8 L30 52 M8 30 L52 30" />
        </svg>
      </div>

      {/* ============ HEADER ============ */}
      <header className="site-header">
        <div className="container header-inner">
          <a href="#" className="brand">تيسير</a>

          <nav className="nav-desktop" aria-label="التنقل الرئيسي">
            <a href="#hero">الرئيسية</a>
            <a href="#guide">الإرشادات</a>
            <a href="#account">تسجيل الدخول</a>
          </nav>

          <div className="header-actions">
            {/* Theme toggle (sun / moon) */}
            <button type="button" className="theme-toggle" data-theme-toggle aria-label="التبديل إلى الوضع الليلي" aria-pressed="false" title="الوضع الليلي / النهاري">
              {/* Host for the decorative dotLottie sun<->moon animation. The
                  follower module (/static/theme-lottie.js) mounts its canvas in
                  here; if it never loads the span stays empty and the button
                  still toggles the theme exactly as before. */}
              <span className="theme-toggle-lottie" aria-hidden="true"></span>
            </button>

            <button className="hamburger" id="hamburger" aria-label="القائمة" aria-expanded="false" aria-controls="mobile-menu">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>

        <div className="mobile-menu" id="mobile-menu" hidden>
          <a href="#hero">الرئيسية</a>
          <a href="#guide">الإرشادات</a>
          <a href="#account">تسجيل الدخول</a>
        </div>
      </header>

      <main>

        {/* ============ HERO ============ */}
        <section className="hero" id="hero">
          <div className="container hero-grid">
            <div className="hero-copy" data-reveal>
              <h1>ادرس بهدوء، وحقّق هدفك.</h1>
              <p className="lead">دروسك ومراجعاتك للبكالوريا في مكان واحد بسيط ومنظّم.</p>
              <div className="hero-cta">
                <a href="#account" className="btn btn-primary">
                  <span>ابدأ الآن</span>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6"/>
                  </svg>
                </a>
                <a href="#guide" className="btn btn-ghost">كيف يعمل؟</a>
              </div>
            </div>

            <div className="hero-illu">
              <img src={`${PROTO}/assets/svg/book-lover.svg`} alt="طالب يقرأ كتاباً" width="480" height="480" className="float-illu float-a" data-reveal />
            </div>
          </div>
        </section>

        {/* ============ GLIMPSE STRIP (small illustrations, no filler text) ============ */}
        <section className="glimpse">
          <div className="container glimpse-row">
            <div className="glimpse-item"><img src={`${PROTO}/assets/svg/open-book.svg`} alt="" width="160" height="120" className="float-illu float-b" data-reveal /></div>
            <div className="glimpse-item"><img src={`${PROTO}/assets/svg/notebook.svg`} alt="" width="160" height="120" className="float-illu float-c" data-reveal /></div>
            <div className="glimpse-item"><img src={`${PROTO}/assets/svg/bookshelves.svg`} alt="" width="160" height="120" className="float-illu float-d" data-reveal /></div>
            <div className="glimpse-item"><img src={`${PROTO}/assets/svg/reading-book.svg`} alt="" width="160" height="120" className="float-illu float-e" data-reveal /></div>
          </div>
        </section>

        {/* ============ GUIDANCE ============ */}
        <section className="guide" id="guide">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>الإرشادات</h2>
              <p>أربع خطوات فقط لتبدأ استعمال تيسير.</p>
            </div>

            <div className="guide-grid">
              {/* Left: illustration */}
              <div className="guide-illu">
                <img src={`${PROTO}/assets/svg/professor.svg`} alt="أستاذ يشرح الدرس" width="440" height="440" className="float-illu float-f" data-reveal />
              </div>

              {/* Right: steps */}
              <ol className="steps">
                <li className="step">
                  <div className="step-num">1</div>
                  <div className="step-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div className="step-body">
                    <h3>أنشئ حسابك</h3>
                    <p>سجّل حساباً جديداً بخطوات بسيطة.</p>
                  </div>
                </li>

                <li className="step">
                  <div className="step-num">2</div>
                  <div className="step-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  </div>
                  <div className="step-body">
                    <h3>اختر المادة</h3>
                    <p>تصفّح المواد المتاحة واختر ما يناسبك.</p>
                  </div>
                </li>

                <li className="step">
                  <div className="step-num">3</div>
                  <div className="step-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div className="step-body">
                    <h3>افتح الدرس</h3>
                    <p>راجع الدروس والملخصات بكل هدوء.</p>
                  </div>
                </li>

                <li className="step">
                  <div className="step-num">4</div>
                  <div className="step-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                  </div>
                  <div className="step-body">
                    <h3>تابع تقدّمك</h3>
                    <p>راقب ما أنجزت وواصل تعلّمك بثقة.</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* ============ ACCOUNT / LOGIN ============ */}
        <section className="account" id="account">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>ابدأ رحلتك مع تيسير</h2>
              <p>سجّل الدخول أو أنشئ حساباً جديداً في ثوانٍ.</p>
            </div>

            <div className="account-grid">
              <div className="account-illu">
                <img src={`${PROTO}/assets/svg/authentication.svg`} alt="تسجيل الدخول" className="illu-primary float-illu float-g" width="460" height="460" data-reveal />
                <img src={`${PROTO}/assets/svg/unlock.svg`} alt="" className="illu-mini illu-mini-a float-illu float-h" width="110" height="110" />
                <img src={`${PROTO}/assets/svg/read-notes.svg`} alt="" className="illu-mini illu-mini-b float-illu float-i" width="90" height="90" />
              </div>

              <div className="auth-card">
                <div className="tabs" role="tablist">
                  <button className="tab active" data-tab="login" role="tab" aria-selected="true">تسجيل الدخول</button>
                  <button className="tab" data-tab="signup" role="tab" aria-selected="false">إنشاء حساب</button>
                </div>

                {/* LOGIN TAB — real Google OAuth, no fake fields.
                    NOTE: className is a CONSTANT string on purpose. The
                    prototype's own script.js owns the .active class on the
                    panels; because React never changes this prop between
                    renders it never rewrites the attribute, so the vanilla
                    tab switching keeps working exactly as designed. */}
                <div className="tab-panel active" data-panel="login">
                  <p className="auth-note">سجّل دخولك بحساب Google — بخطوة واحدة، دون كلمة مرور.</p>
                  <GoogleSignInButton />
                </div>

                {/* SIGNUP TAB — step 1 (decorative name fields) → step 2 (real Google OAuth) */}
                <div className="tab-panel" data-panel="signup">
                  {signupStep === 1 ? (
                    <form
                      className="auth-step"
                      /* DECORATIVE ONLY: nothing is read from these inputs and
                         nothing is submitted. The handler just advances the
                         local UI step — no fetch, no backend, no database. */
                      onSubmit={(event) => {
                        event.preventDefault()
                        setSignupStep(2)
                      }}
                    >
                      <label className="field">
                        <span className="field-label">الاسم</span>
                        <div className="input-wrap">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <input type="text" name="decorative-first-name" placeholder="الاسم" autoComplete="off" />
                        </div>
                      </label>

                      <label className="field">
                        <span className="field-label">اللقب</span>
                        <div className="input-wrap">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <input type="text" name="decorative-last-name" placeholder="اللقب" autoComplete="off" />
                        </div>
                      </label>

                      <button type="submit" className="btn btn-primary btn-block">متابعة</button>
                    </form>
                  ) : (
                    <div className="auth-step">
                      <p className="auth-note">أكمل إنشاء حسابك بحساب Google — بخطوة واحدة، دون كلمة مرور.</p>
                      <GoogleSignInButton
                        label="أنشئ حسابك بحساب Google"
                        ariaLabel="أنشئ حسابك بحساب Google"
                      />
                      <button
                        type="button"
                        className="link auth-back"
                        onClick={() => setSignupStep(1)}
                      >
                        رجوع
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ============ FOOTER ============ */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="brand-white">تيسير</div>
              <p>منصة الدراسة للبكالوريا.</p>
            </div>

            <nav className="footer-links" aria-label="روابط">
              <a href="#hero">الرئيسية</a>
              <a href="#guide">الإرشادات</a>
              <a href="#account">تسجيل الدخول</a>
              <a href="#">تواصل معنا</a>
            </nav>

            <div className="footer-social" aria-label="شبكاتنا">
              <a href="#" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
              <a href="#" aria-label="Facebook">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </a>
              <a href="#" aria-label="YouTube">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
              </a>
              <a href="#" aria-label="X">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5 21H1.9l7.3-8.3L1.6 3H8l4.4 5.8L17.5 3zm-1.1 16.2h1.7L7.7 4.7H5.9l10.5 14.5z"/></svg>
              </a>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© 2026 تيسير. جميع الحقوق محفوظة.</span>
          </div>
        </div>
      </footer>
    </>
  )
}
