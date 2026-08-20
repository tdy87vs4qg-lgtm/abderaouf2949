import { Suspense, lazy } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import AmbientBackdrop from './components/AmbientBackdrop'
import InAppBrowserNotice from './components/InAppBrowserNotice'
import ScrollToTop from './components/ScrollToTop'
import SiteHeader from './components/SiteHeader'
import { LazyAnimatePresence } from './lib/lazyMotion'

// ── Route-based code splitting ────────────────────────────────────────────
// Each page is loaded in its own lazy chunk so the initial bundle only carries
// the shell (header, backdrop, router) plus whatever the first route needs.
// The remaining pages are fetched on demand, keeping first paint fast on
// mobile. No features or animations are removed — they are only deferred.
const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'))

export default function App() {
  const location = useLocation()

  // The redesigned home page is a self-contained, single-screen composition:
  // it carries its OWN minimal chrome (brand top-left + a ⋮ menu top-right)
  // and its own pristine grid ground. The global SiteHeader and the cinematic
  // AmbientBackdrop would both fight that composition, so they are simply not
  // mounted wherever HomePage renders. That includes the catch-all route, which
  // also renders HomePage. Every other route keeps them exactly as before.
  const CHROME_ROUTES = ['/login', '/signup', '/subscription']
  const isHome = !CHROME_ROUTES.includes(location.pathname)

  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-ink text-white" dir="rtl">
      <ScrollToTop />
      {!isHome && <AmbientBackdrop />}
      {/* Shown ONLY inside an in-app browser (TikTok / Instagram / Facebook /
          Telegram web views), where Google's OAuth screen refuses to load.
          Renders null everywhere else and touches no auth logic. */}
      <InAppBrowserNotice />
      {!isHome && <SiteHeader />}
      <Suspense fallback={<div className="route-loading" aria-hidden="true" />}>
        <LazyAnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </LazyAnimatePresence>
      </Suspense>
    </div>
  )
}
