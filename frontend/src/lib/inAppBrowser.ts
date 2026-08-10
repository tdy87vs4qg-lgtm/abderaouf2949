// ---------------------------------------------------------------------------
// inAppBrowser — User-Agent detection for embedded / in-app web views
//
// WHY THIS EXISTS (UI concern only — no auth logic lives here):
// Social apps (TikTok, Instagram, Facebook, Messenger, Telegram, Snapchat, …)
// do not hand a tapped link to the phone's real browser. They open it inside
// their OWN embedded web view. Those web views are deliberately crippled:
// Google refuses to render its consent screen inside them ("disallowed_useragent"
// / 403), third-party and even first-party cookies are often partitioned or
// dropped, and `window.open` is frequently blocked. The practical result for
// تيسير is that "سجّل الدخول بحساب Google" simply cannot complete.
//
// The fix is not technical, it is instructional: tell the visitor, in Arabic,
// to reopen the same link in Chrome or Safari. This module only ANSWERS THE
// QUESTION "are we inside such a web view?" — it renders nothing, stores
// nothing, and touches no session, cookie, route or backend behaviour.
//
// DETECTION STRATEGY (intentionally conservative):
//   1. Positive signals — vendor-specific tokens the in-app browsers inject
//      into navigator.userAgent (e.g. `Instagram`, `FBAN`, `musical_ly`).
//   2. Platform heuristics — on iOS every browser is WebKit, but SFSafariView /
//      WKWebView embeds omit the `Safari/` token that real Safari always sends,
//      which is a reliable "this is an embed" tell. On Android, the `; wv`
//      token marks an Android WebView.
//   3. Allow-list guards — real browsers that would otherwise trip a heuristic
//      (Chrome iOS `CriOS`, Firefox iOS `FxiOS`, Edge iOS `EdgiOS`, Opera,
//      standalone PWAs) are explicitly excluded so we never nag a user whose
//      login would have worked fine.
//
// A false NEGATIVE is harmless (the user sees the normal page). A false
// POSITIVE is annoying, so every heuristic below errs toward staying silent.
// ---------------------------------------------------------------------------

/** Which embedded web view we believe we are running inside. */
export type InAppBrowserName =
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'messenger'
  | 'telegram'
  | 'snapchat'
  | 'twitter'
  | 'linkedin'
  | 'pinterest'
  | 'whatsapp'
  | 'line'
  | 'wechat'
  | 'webview'

export type InAppBrowserInfo = {
  /** True when the page is (very likely) inside an embedded in-app web view. */
  isInApp: boolean
  /** Best guess at the host app; `webview` for a generic/unnamed embed. */
  name: InAppBrowserName | null
  /** Coarse platform, used to pick the right Arabic "how to escape" steps. */
  platform: 'ios' | 'android' | 'other'
}

/** Named in-app browsers, matched on the tokens each one injects into the UA. */
const SIGNATURES: ReadonlyArray<readonly [InAppBrowserName, RegExp]> = [
  // TikTok ships several build tokens depending on region/version.
  ['tiktok', /\b(?:BytedanceWebview|BytedanceWebView|musical_ly|Bytelocale|tiktok_webview|TikTok)\b/i],
  ['instagram', /\bInstagram\b/i],
  // FBAN/FBAV = Facebook app; FB_IAB = Facebook In-App Browser.
  ['messenger', /\b(?:FB_IAB\/MESSENGER|Messenger(?:Lite)?ForiOS|MessengerLiteForAndroid)\b/i],
  ['facebook', /\b(?:FBAN|FBAV|FB_IAB|FBIOS|FB4A)\b/i],
  ['telegram', /\bTelegram(?:Bot)?\b/i],
  ['snapchat', /\bSnapchat\b/i],
  ['twitter', /\b(?:Twitter|TwitterAndroid)\b/i],
  ['linkedin', /\bLinkedInApp\b/i],
  ['pinterest', /\bPinterest\b/i],
  ['whatsapp', /\bWhatsApp\b/i],
  ['line', /\bLine\//i],
  ['wechat', /\b(?:MicroMessenger|WeChat)\b/i],
]

/**
 * Real, standalone browsers that must NEVER be flagged. Checked before the
 * platform heuristics so an iOS Chrome / Firefox / Edge / Opera user (whose
 * Google login works perfectly) is never shown the notice.
 */
const REAL_BROWSERS =
  /\b(?:CriOS|FxiOS|EdgiOS|OPiOS|OPR|OPT\/|YaBrowser|DuckDuckGo|Brave|SamsungBrowser|Firefox|Edg)\b/i

/** Android WebView marker: the literal `; wv` token inside the UA parentheses. */
const ANDROID_WEBVIEW = /;\s*wv\b/i

/**
 * Inspect a User-Agent string and decide whether we are inside an in-app
 * browser. Pure function — no DOM, no side effects — so it is trivially safe
 * to call during render and easy to reason about.
 *
 * @param userAgent Raw `navigator.userAgent` (defaults to an empty string).
 * @param standalone `navigator.standalone` — true for an iOS home-screen PWA,
 *   which is a legitimate WebKit shell we must not flag.
 */
export function detectInAppBrowser(userAgent: string, standalone = false): InAppBrowserInfo {
  const ua = userAgent || ''

  // Platform first — it drives the Arabic instructions we show, and it is
  // reported even when we decide NOT to flag the browser.
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))
  const isAndroid = /Android/i.test(ua)
  const platform: InAppBrowserInfo['platform'] = isIOS ? 'ios' : isAndroid ? 'android' : 'other'

  if (!ua) return { isInApp: false, name: null, platform }

  // 1. Vendor tokens are unambiguous — trust them even on desktop UAs.
  for (const [name, pattern] of SIGNATURES) {
    if (pattern.test(ua)) return { isInApp: true, name, platform }
  }

  // A genuine third-party browser from here on is never an embed.
  if (REAL_BROWSERS.test(ua)) return { isInApp: false, name: null, platform }

  // 2a. Android: the `; wv` token is emitted only by an embedded WebView.
  if (isAndroid && ANDROID_WEBVIEW.test(ua)) {
    return { isInApp: true, name: 'webview', platform }
  }

  // 2b. iOS: real Safari always appends `Safari/<version>` after `Version/…`.
  //     A WKWebView / SFSafariViewController embed sends `AppleWebKit … Mobile/…`
  //     WITHOUT the `Safari/` token. A home-screen PWA (navigator.standalone)
  //     does the same but is legitimate, so it is excluded.
  if (isIOS && !standalone && /AppleWebKit/i.test(ua) && !/\bSafari\//i.test(ua)) {
    return { isInApp: true, name: 'webview', platform }
  }

  return { isInApp: false, name: null, platform }
}

/**
 * Browser-side convenience wrapper. Returns a safe "not in-app" result during
 * SSR / prerender, where `navigator` does not exist.
 */
export function detectCurrentBrowser(): InAppBrowserInfo {
  if (typeof navigator === 'undefined') {
    return { isInApp: false, name: null, platform: 'other' }
  }
  const standalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return detectInAppBrowser(navigator.userAgent, standalone)
}

/** Human-readable Arabic label for the host app, used inside the notice copy. */
export function inAppBrowserLabel(name: InAppBrowserName | null): string {
  switch (name) {
    case 'tiktok':
      return 'تيك توك'
    case 'instagram':
      return 'إنستغرام'
    case 'facebook':
      return 'فيسبوك'
    case 'messenger':
      return 'ماسنجر'
    case 'telegram':
      return 'تيليغرام'
    case 'snapchat':
      return 'سناب شات'
    case 'twitter':
      return 'إكس (تويتر)'
    case 'linkedin':
      return 'لينكد إن'
    case 'pinterest':
      return 'بينتريست'
    case 'whatsapp':
      return 'واتساب'
    case 'line':
      return 'لاين'
    case 'wechat':
      return 'وي شات'
    default:
      return 'التطبيق'
  }
}
