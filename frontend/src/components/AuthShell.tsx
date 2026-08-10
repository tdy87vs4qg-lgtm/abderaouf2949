import { Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect } from 'react'
import PageTransition from './PageTransition'
import AuthMascot from './AuthMascot'
import GoogleSignInButton from './GoogleSignInButton'
import { useSession } from '../lib/useSession'

type AuthShellProps = {
  mode: 'login' | 'signup'
}

// ---------------------------------------------------------------------------
// AuthShell — GOOGLE-ONLY SIGN-IN SCREEN (STEP 3, UI ONLY)
//
// The email/password form (fields, show/hide toggle, client-side validation,
// the POST to /api/auth/login and /api/auth/signup, the localStorage device
// fingerprint and the DEVICE_BLOCKED / credential error copy) has been removed
// from the UI. Authentication now happens exclusively through Google, which
// handles BOTH signing in and creating an account — so a single button covers
// what used to be two separate flows, and /login and /signup render the exact
// same screen.
//
// What this component still does, unchanged:
//   • useSession(): an already-authenticated visitor who lands here is sent
//     straight into the app (/library, or /admin for an admin) instead of being
//     shown a sign-in screen.
//   • The eye-tracking fox mascot, the page layout, the animations and every
//     other piece of Arabic copy on the page.
//
// NOTHING SERVER-SIDE IS TOUCHED: the OAuth start route (GET /api/auth/google),
// the callback (GET /api/auth/google/callback), session issuing/persistence,
// the subscription/approval gate, Drive, the PDF viewer guard, the IndexedDB
// cache and rate limiting are all left exactly as they are.
// ---------------------------------------------------------------------------
export default function AuthShell({ mode }: AuthShellProps) {
  const isSignup = mode === 'signup'

  // Reflect the restored server session. If a valid bac_session cookie already
  // exists, an authenticated visitor landing on /login or /signup is sent
  // straight into the internal experience instead of being shown a sign-in
  // screen (which would look as if they were logged out). Hitting /me here also
  // slides the session + cookie forward.
  const session = useSession()
  useEffect(() => {
    if (session.authenticated && session.destination) {
      window.location.replace(session.destination)
    }
  }, [session.authenticated, session.destination])

  return (
    <PageTransition>
      <section className="auth-page page-pad flex items-start justify-center px-5 pb-16 pt-32 sm:pt-40 lg:items-center">
        <div className="auth-layout mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <motion.aside
            className="hidden lg:block"
            initial={{ opacity: 0, x: 35 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <span className="eyebrow"><Sparkles size={14} /> قرار صغير. فرق كبير.</span>
            <h1 className="mt-7 text-5xl font-black leading-[1.2] xl:text-6xl">
              {isSignup ? <>اقترب خطوة من<br /><span className="text-gradient">النتيجة التي تحلم بها.</span></> : <>مرحبًا بعودتك،<br /><span className="text-gradient">طريق التفوق ينتظرك.</span></>}
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-9 text-white/55">
              {isSignup ? 'أنشئ حسابك، واجمع دروسك وتمارينك ومواضيعك في مكان واحد هادئ ومنظم.' : 'عد إلى مساحتك في تيسير، أكمل من حيث توقفت، وحوّل كل ساعة مراجعة إلى خطوة محسوبة نحو النجاح.'}
            </p>
            <div className="quote-mark mt-10">
              <span>“</span>
              <p>لا تحتاج إلى وقت أكثر، بل إلى طريق أوضح.</p>
            </div>
          </motion.aside>

          <motion.div
            className="auth-card auth-card--google"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="auth-card__glow" />

            {/* eye-tracking mascot peeking over the card — always idle now that
                there is no password field to react to. */}
            <div className="auth-card__mascot">
              <AuthMascot state="idle" />
            </div>

            <div className="relative z-10 text-center">
              <p className="mb-2 text-sm font-bold text-cyan">سجّل دخولك إلى تيسير</p>
              <h2 className="text-3xl font-black md:text-4xl">أهلًا بك في تيسير</h2>
              <p className="mt-3 text-sm leading-7 text-white/45">
                الدخول وإنشاء الحساب يتمّان عبر حساب Google الخاص بك — بخطوة واحدة، دون كلمة مرور.
              </p>

              <div className="mt-9">
                <GoogleSignInButton />
              </div>

              <p className="mt-7 text-xs leading-6 text-white/40">
                سيتم تحويلك إلى صفحة Google لتأكيد الدخول، ثم تعود إلى تيسير مباشرة.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </PageTransition>
  )
}
