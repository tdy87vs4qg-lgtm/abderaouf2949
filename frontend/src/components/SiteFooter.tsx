import { ArrowUpLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/8 px-5 py-10 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="footer-brand mb-3">تيسير</p>
          <p className="max-w-md text-sm leading-7 text-white/45">منصّة صُنعت لتمنحك وضوح الطريق، وتترك لك أهم شيء: وقتك وتركيزك.</p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-white/55">
          <Link to="/login" className="transition hover:text-white">تسجيل الدخول</Link>
          <Link to="/signup" className="transition hover:text-white">إنشاء حساب</Link>
          <a href="https://www.tiktok.com/@abderahmane.lovenature" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition hover:text-white">تواصل معنا <ArrowUpLeft size={14} /></a>
        </div>
      </div>
    </footer>
  )
}
