import { useEffect, useMemo, useState } from 'react'
import { detectCurrentBrowser, inAppBrowserLabel } from '../lib/inAppBrowser'

// ---------------------------------------------------------------------------
// InAppBrowserNotice — Arabic RTL overlay shown inside in-app browsers
//
// PROBLEM: when تيسير is opened from a TikTok / Instagram / Facebook / Telegram
// link, the page loads inside that app's embedded web view. Google blocks its
// OAuth consent screen in those web views ("disallowed_useragent"), so the ONLY
// way into the platform — "سجّل الدخول بحساب Google" — silently fails and the
// visitor thinks the site is broken.
//
// SOLUTION (pure UI): detect the embedded web view from the User-Agent (see
// ../lib/inAppBrowser.ts) and show a calm, on-brand Arabic notice explaining
// how to reopen the same link in Chrome or Safari, with a one-tap "copy link"
// affordance. Nothing here authenticates, stores a session, calls the backend
// or changes a route — it is markup, styles and clipboard access only.
//
// ACCESSIBILITY / UX NOTES:
//   • role="dialog" + aria-modal, labelled by its own title, focus sent to the
//     panel on mount so screen readers announce it immediately.
//   • Body scroll is locked while it is visible and restored on unmount.
//   • Dismissible: the visitor can continue browsing the public pages (only
//     Google login is affected), and the choice is remembered for the tab via
//     sessionStorage — never longer, so the guidance returns on a fresh visit.
//   • All entrance motion is CSS-only and disabled under
//     `prefers-reduced-motion: reduce` (see styles.css).
// ---------------------------------------------------------------------------

/** Per-tab key remembering that the visitor dismissed the notice. */
const DISMISS_KEY = 'taysir-inapp-notice-dismissed'

export default function InAppBrowserNotice() {
  // Detect once, on mount only. Reading `navigator` during render would be
  // wrong for SSR/hydration, and the UA cannot change during a page's life.
  const [info, setInfo] = useState<ReturnType<typeof detectCurrentBrowser> | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alreadyDismissed = false
    try {
      alreadyDismissed = sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      /* private mode / storage disabled — just show the notice */
    }
    if (alreadyDismissed) {
      setDismissed(true)
      return
    }
    setInfo(detectCurrentBrowser())
  }, [])

  const visible = Boolean(info?.isInApp) && !dismissed

  // Lock background scrolling only while the overlay is actually on screen.
  useEffect(() => {
    if (!visible) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [visible])

  // Reset the "تم النسخ" confirmation shortly after it appears.
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const appLabel = useMemo(() => inAppBrowserLabel(info?.name ?? null), [info?.name])

  // Platform-specific escape route. iOS embeds surface a Safari/compass glyph;
  // Android web views surface the ⋮ overflow menu.
  const steps =
    info?.platform === 'ios'
      ? [
          'اضغط على أيقونة المشاركة أو القائمة أعلى الصفحة.',
          'اختر «فتح في Safari» أو «Open in Safari».',
          'أو انسخ الرابط بالأسفل والصقه في Safari أو Chrome.',
        ]
      : info?.platform === 'android'
        ? [
            'اضغط على زر القائمة (⋮) في أعلى الصفحة.',
            'اختر «فتح في المتصفح» أو «Open in browser».',
            'أو انسخ الرابط بالأسفل والصقه في Chrome.',
          ]
        : [
            'افتح متصفحك (Chrome أو Safari).',
            'الصق الرابط في شريط العنوان ثم اضغط «انتقال».',
          ]

  if (!visible) return null

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl)
      } else {
        // Legacy fallback: many in-app web views still lack the async
        // Clipboard API, so fall back to a hidden textarea + execCommand.
        const field = document.createElement('textarea')
        field.value = pageUrl
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        document.execCommand('copy')
        document.body.removeChild(field)
      }
      setCopied(true)
    } catch {
      // Copying can be blocked outright inside a web view. Selecting the URL
      // text below still lets the visitor copy it manually.
      setCopied(false)
    }
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* storage unavailable — dismissing for this render is enough */
    }
    setDismissed(true)
  }

  return (
    <div
      className="inapp-notice"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inapp-notice-title"
      aria-describedby="inapp-notice-body"
    >
      <div className="inapp-notice__backdrop" aria-hidden="true" />

      <div className="inapp-notice__panel" tabIndex={-1} autoFocus>
        <div className="inapp-notice__glow" aria-hidden="true" />

        <span className="inapp-notice__icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8" />
            <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
          </svg>
        </span>

        <h2 className="inapp-notice__title" id="inapp-notice-title">
          افتح الرابط في متصفحك
        </h2>

        <p className="inapp-notice__body" id="inapp-notice-body">
          لفتح المنصة بشكل صحيح، افتح الرابط في متصفحك (Chrome أو Safari). انسخ
          الرابط أو اضغط على القائمة (⋮) ثم «فتح في المتصفح».
        </p>

        <p className="inapp-notice__reason">
          أنت تتصفّح الآن من داخل تطبيق {appLabel}، وتسجيل الدخول بحساب Google لا
          يعمل داخل المتصفح المدمج.
        </p>

        <ol className="inapp-notice__steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="inapp-notice__url" dir="ltr" aria-label="رابط الصفحة">
          {pageUrl}
        </div>

        <div className="inapp-notice__actions">
          <button type="button" className="inapp-notice__copy" onClick={handleCopy}>
            {copied ? 'تم نسخ الرابط ✓' : 'انسخ الرابط'}
          </button>
          <button type="button" className="inapp-notice__dismiss" onClick={handleDismiss}>
            متابعة التصفح على أي حال
          </button>
        </div>
      </div>
    </div>
  )
}
