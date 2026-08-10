import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageTransition from './PageTransition'
import AuthMascot from './AuthMascot'
import type { MascotState } from './mascot/types'
import { useSession } from '../lib/useSession'

type AuthShellProps = {
  mode: 'login' | 'signup'
}

// Human-readable Arabic messages for the server error codes exposed by the
// تيسير auth API (see src/routes/auth.ts). Anything unmapped falls back
// to a friendly generic line.
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  ACCOUNT_SUSPENDED: 'تم تعليق هذا الحساب. تواصل معنا لإعادة تفعيله.',
  RATE_LIMITED: 'محاولات كثيرة. يرجى الانتظار قليلًا ثم إعادة المحاولة.',
  AUTH_UNAVAILABLE: 'خدمة الدخول غير متاحة حاليًا. حاول لاحقًا.',
  BAD_REQUEST: 'تعذّر إرسال البيانات. تحقّق من الحقول وحاول مجددًا.',
  INVALID_EMAIL: 'يرجى إدخال بريد إلكتروني صحيح.',
  WEAK_PASSWORD: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.',
  EMAIL_TAKEN: 'هذا البريد الإلكتروني مستعمل من قبل.',
  PASSWORD_MISMATCH: 'كلمتا المرور غير متطابقتين.',
  TERMS_REQUIRED: 'يجب الموافقة على شروط الاستخدام للمتابعة.',
  // Login blocked because it came from a device other than the account's bound
  // one. The server has recorded a pending request for an admin to approve.
  DEVICE_BLOCKED: 'تم رفض الدخول من هذا الجهاز. أُرسل طلب إلى المشرف، انتظر الموافقة.',
}

// ---------------------------------------------------------------------------
// Device fingerprint (client half of single-device binding) — SECONDARY hint
//
// The PRIMARY, authoritative device signal is now a durable httpOnly device-id
// cookie the SERVER sets on first login (bac_device). Because that cookie is
// httpOnly it survives a localStorage clear / private mode / ITP eviction, so
// the device identity no longer changes when storage is wiped — which is what
// used to turn a transient storage loss into a permanent DEVICE_BLOCKED.
//
// This client value is therefore only a best-effort SECONDARY hint used on the
// very first login (before the server cookie exists). It is a stable random id
// persisted in localStorage. We deliberately DO NOT mix in volatile signals
// like screen size/orientation (which change between loads on mobile and would
// alter the id); we keep only the truly stable UA/language hint. If storage is
// unavailable we return an empty string and let the server fall back to the
// device cookie / header hints — we never fabricate a volatile per-load id.
// ---------------------------------------------------------------------------
function getDeviceFingerprint(): string {
  const KEY = 'taysir_device_id'
  try {
    let id = window.localStorage.getItem(KEY)
    if (id && id.length >= 16) return id
    const bytes = new Uint8Array(16)
    ;(window.crypto || ({} as any)).getRandomValues?.(bytes)
    id = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // Mix in only STABLE, non-volatile environment signals (UA + language).
    // Screen size/orientation are intentionally excluded — they change between
    // loads (e.g. device rotation) and must not affect the device identity.
    const env = [navigator.userAgent, navigator.language]
      .join('|')
      .replace(/[^a-zA-Z0-9|]/g, '')
      .slice(0, 64)
    id = id + '.' + env
    window.localStorage.setItem(KEY, id)
    return id
  } catch {
    // Private mode / storage blocked → return empty so the server relies on the
    // durable device-id cookie (primary) or header hints, rather than a
    // volatile, per-load value that would falsely look like a new device.
    return ''
  }
}

function messageFor(code: string | undefined, serverMessage?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (serverMessage) return serverMessage
  return 'حدث خطأ غير متوقّع. حاول مرة أخرى.'
}

export default function AuthShell({ mode }: AuthShellProps) {
  const isSignup = mode === 'signup'
  // Fix #1: reflect the restored server session. If a valid bac_session cookie
  // already exists, an authenticated visitor landing on /login or /signup is
  // sent straight into the internal experience instead of being shown a
  // sign-in form (which would look as if they were logged out). Hitting /me
  // here also slides the session + cookie forward.
  const session = useSession()
  useEffect(() => {
    if (session.authenticated && session.destination) {
      window.location.replace(session.destination)
    }
  }, [session.authenticated, session.destination])

  // The mascot reacts to the password field: it covers its eyes while a hidden
  // password is being typed and peeks through its paws once it's revealed.
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [passwordRevealed, setPasswordRevealed] = useState(false)

  // Controlled form state — wired to the existing تيسير auth endpoints.
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mascotState: MascotState = useMemo(() => {
    // Peek when the (focused) password is shown; cover while it's hidden.
    if (passwordFocused && passwordRevealed) return 'peeking'
    if (passwordFocused) return 'covering'
    if (passwordRevealed) return 'peeking'
    return 'idle'
  }, [passwordFocused, passwordRevealed])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setError(null)

    // Client-side pre-checks (mirrors the server contract for nicer UX).
    if (!email.trim() || !password) {
      setError(messageFor('INVALID_CREDENTIALS'))
      return
    }
    if (isSignup) {
      if (password.length < 8) {
        setError(messageFor('WEAK_PASSWORD'))
        return
      }
      if (password !== confirm) {
        setError(messageFor('PASSWORD_MISMATCH'))
        return
      }
      if (!agree) {
        setError(messageFor('TERMS_REQUIRED'))
        return
      }
    }

    const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login'

    setSubmitting(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), password, fingerprint: getDeviceFingerprint() }),
      })

      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (res.ok && data && data.ok) {
        // Success → the server has set the persistent session cookie. Route the
        // user into the internal library (admins land on the console). A full
        // navigation (not client-side) hands control to the Hono-rendered
        // internal experience, exactly as the original app behaved.
        const role = data.user?.role
        window.location.href = role === 'admin' ? '/admin' : '/library'
        return
      }

      setError(messageFor(data?.error, data?.message))
    } catch {
      setError(messageFor('AUTH_UNAVAILABLE'))
    } finally {
      setSubmitting(false)
    }
  }

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
            className="auth-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="auth-card__glow" />

            {/* eye-tracking mascot peeking over the card */}
            <div className="auth-card__mascot">
              <AuthMascot state={mascotState} />
            </div>

            <div className="relative z-10">
              <p className="mb-2 text-sm font-bold text-cyan">{isSignup ? 'ابدأ رحلتك مع تيسير' : 'سجّل دخولك إلى تيسير'}</p>
              <h2 className="text-3xl font-black md:text-4xl">{isSignup ? 'إنشاء حساب جديد' : 'أهلًا بك من جديد'}</h2>
              <p className="mt-3 text-sm leading-7 text-white/45">{isSignup ? 'بيانات بسيطة، وبداية أكثر تنظيمًا وثقة.' : 'أدخل بياناتك للوصول إلى مساحتك التعليمية.'}</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
                {isSignup && (
                  <AuthField
                    icon={<UserRound size={18} />}
                    label="الاسم الكامل"
                    type="text"
                    placeholder="كيف نكتب اسمك؟"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                )}
                <AuthField
                  icon={<Mail size={18} />}
                  label="البريد الإلكتروني"
                  type="email"
                  placeholder="name@example.com"
                  ltr
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <AuthField
                  icon={<LockKeyhole size={18} />}
                  label="كلمة المرور"
                  type="password"
                  placeholder="اكتب كلمة المرور"
                  ltr
                  secure
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onSecureFocus={() => setPasswordFocused(true)}
                  onSecureBlur={() => setPasswordFocused(false)}
                  onRevealChange={setPasswordRevealed}
                />
                {isSignup && (
                  <AuthField
                    icon={<LockKeyhole size={18} />}
                    label="تأكيد كلمة المرور"
                    type="password"
                    placeholder="أعد كتابة كلمة المرور"
                    ltr
                    secure
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onSecureFocus={() => setPasswordFocused(true)}
                    onSecureBlur={() => setPasswordFocused(false)}
                    onRevealChange={setPasswordRevealed}
                  />
                )}

                {error && (
                  <p className="auth-error rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 text-xs text-white/45">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-cyan"
                      checked={isSignup ? agree : undefined}
                      onChange={isSignup ? (e) => setAgree(e.target.checked) : undefined}
                    />{' '}
                    {isSignup ? 'أوافق على شروط الاستخدام' : 'تذكّرني'}
                  </label>
                  {!isSignup && <button type="button" className="hover:text-cyan">نسيت كلمة المرور؟</button>}
                </div>
                <button type="submit" className="button-primary mt-3 w-full justify-center py-4" disabled={submitting}>
                  {submitting ? 'جارٍ المعالجة…' : isSignup ? 'أنشئ حسابي' : 'دخول إلى تيسير'} <ArrowLeft size={18} />
                </button>
              </form>

              <p className="mt-7 text-center text-sm text-white/45">
                {isSignup ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب بعد؟'}{' '}
                <Link to={isSignup ? '/login' : '/signup'} className="font-bold text-white transition hover:text-cyan">
                  {isSignup ? 'سجّل دخولك' : 'أنشئ حسابك مجانًا'}
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </PageTransition>
  )
}

type AuthFieldProps = {
  icon: ReactNode
  label: string
  secure?: boolean
  ltr?: boolean
  onSecureFocus?: () => void
  onSecureBlur?: () => void
  onRevealChange?: (revealed: boolean) => void
} & React.InputHTMLAttributes<HTMLInputElement>

function AuthField({ icon, label, secure, ltr, type, onSecureFocus, onSecureBlur, onRevealChange, ...props }: AuthFieldProps) {
  const [visible, setVisible] = useState(false)

  const toggleVisible = () => {
    setVisible((value) => {
      const next = !value
      onRevealChange?.(next)
      return next
    })
  }
  // Secure fields behave like a normal password input: hidden = real password
  // dots, revealed = plain readable text. No blur effect at all.
  const inputType = secure ? (visible ? 'text' : 'password') : type

  return (
    <label className="auth-field">
      <span className="auth-field__label">{label}</span>
      <span className="auth-field__control">
        <span className="text-white/35">{icon}</span>
        <input
          {...props}
          type={inputType}
          dir={ltr ? 'ltr' : 'rtl'}
          autoComplete={secure ? 'off' : props.autoComplete}
          onFocus={(e) => {
            if (secure) onSecureFocus?.()
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            if (secure) onSecureBlur?.()
            props.onBlur?.(e)
          }}
        />
        {secure && (
          <button
            type="button"
            onClick={toggleVisible}
            className="text-white/25 transition hover:text-white/60"
            aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </span>
    </label>
  )
}
