import { motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, UserPlus, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageTransition from '../components/PageTransition'
import Reveal from '../components/Reveal'
import SiteFooter from '../components/SiteFooter'
import WriteInText from '../components/WriteInText'
import DraggablePapers from '../components/DraggablePapers'
import TopStudents from '../components/TopStudents'

export default function HomePage() {
  return (
    <PageTransition>
      {/* ── HERO / INTRO ─────────────────────────────────────────── */}
      <section
        id="hero-section"
        className="hero-section relative flex min-h-[100svh] items-center overflow-hidden px-5 pt-32 pb-24 lg:px-10"
      >
        <div className="hero-vignette" />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          {/* Small, quiet eyebrow — grounds the hero without a boxy badge */}
          <motion.p
            className="hero-eyebrow"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="hero-eyebrow__dot" aria-hidden="true" />
            منصّة البكالوريا
          </motion.p>

          {/* The slogan writes itself in on scroll (re-triggers each time) */}
          <WriteInText
            as="h1"
            className="hero-slogan mt-6"
            ariaLabel="تيسير.. لأننا نؤمن أن خلف كل تفوقٍ، حلمٌ يستحق الدعم"
            writeIn
            duration={1.5}
            start="top 92%"
            segments={[
              { text: 'تيسير', brand: true },
              { text: '..\n' },
              { text: 'لأننا نؤمن أن خلف كل تفوقٍ،\n' },
              { text: 'حلمٌ يستحق الدعم' },
            ]}
          />

          {/* Two premium entry actions — signup first (right in RTL) */}
          <motion.div
            className="hero-actions mt-11"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Link to="/signup" className="button-primary hero-cta">
              <UserPlus size={18} strokeWidth={2.4} />
              إنشاء حساب
            </Link>
            <Link to="/login" className="button-secondary hero-cta">
              <LogIn size={18} strokeWidth={2.2} />
              تسجيل الدخول
            </Link>
          </motion.div>

          <div className="scroll-cue">
            <span>اكتشف الحكاية</span>
            <ArrowDown size={17} />
          </div>
        </div>
      </section>

      {/* ── STORY: our story paragraph ───────────────────────────── */}
      <section id="story-section" className="section-shell relative px-5 py-28 lg:px-10 lg:py-40">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <span className="section-index">01 — حكايتنا</span>
          </Reveal>
          <WriteInText
            as="p"
            className="story-paragraph mt-10"
            ariaLabel="تيسير هي حكاية تعبنا"
            start="top 80%"
            segments={[
              { text: 'تيسير', brand: true },
              {
                text:
                  ' هي حكاية تعبنا، سهرنا، وشغفنا الكبير بأن نكون السند الذي تمنينا يوماً أن نجده. جمعنا كل ما نملك من علمٍ وحب، لنُسَهّل عليكم الطريق.. فقط لأننا نؤمن أن أحلامكم تستحق منا كل هذا الإخلاص.',
              },
            ]}
          />
        </div>
      </section>

      {/* ── PLATFORM DESCRIPTION ─────────────────────────────────── */}
      <section id="platform-section" className="full-bleed-story relative my-8 overflow-hidden px-5 py-28 lg:px-10 lg:py-40">
        <div className="story-line" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <Reveal>
            <span className="section-index">02 — ما هي تيسير</span>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="platform-paragraph mt-10">
              <span className="platform-brand">تيسير</span> منصة تعليمية صُممت خصيصًا لطلاب الباكالوريا،
              لتوفر لهم كل ما يحتاجونه خلال السنة الدراسية في مكان واحد. ستجد الدروس، الملخصات، التمارين،
              والعديد من المصادر التي تساعدك على الفهم الجيد والاستعداد للاختبارات، حتى تتمكن من التركيز على
              الدراسة بدل إضاعة الوقت في البحث.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── TOP STUDENTS (المتفوقون) — third section ─────────────── */}
      <section id="laureates-section" className="full-bleed-story relative my-8 overflow-hidden px-5 py-28 lg:px-10 lg:py-40">
        <div className="relative z-10 mx-auto max-w-7xl">
          <Reveal className="max-w-3xl">
            <span className="section-index">03 — المتفوقون</span>
            <h2 className="display-quote mt-8">أسماء صنعت الفارق.</h2>
            <p className="section-copy mt-6">
              خلف تيسير طلبةٌ عاشوا ضغط البكالوريا، وبلغوا القمة. هذه أسماؤهم، ومدارسهم، وعلاماتهم — شهادةٌ
              على أن الحلم يستحق كل هذا الإخلاص.
            </p>
          </Reveal>
          <TopStudents />
        </div>
      </section>

      {/* ── DRAGGABLE PAPERS (features) ──────────────────────────── */}
      <section id="papers-section" className="section-shell relative px-5 py-24 lg:px-10 lg:py-36">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-4 max-w-3xl">
            <span className="section-index">04 — على طاولتك</span>
            <h2 className="section-title mt-6">كل ما تحتاجه، ورقةً ورقة.</h2>
          </Reveal>
          <DraggablePapers />
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────── */}
      <section id="final-cta" className="px-5 pb-24 pt-12 lg:px-10 lg:pb-32">
        <Reveal>
          <div className="final-cta mx-auto max-w-7xl">
            <h2>نجاحك لا يبدأ يوم الامتحان.<br /><span>يبدأ من قرارك اليوم.</span></h2>
            <p>دع عنك ضجيج المصادر، وابدأ مراجعة تشبه طموحك مع تيسير.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/signup" className="button-primary">أنشئ حسابك الآن <ArrowLeft size={18} /></Link>
              <Link to="/login" className="button-secondary">لدي حساب بالفعل</Link>
            </div>
          </div>
        </Reveal>
      </section>
      <SiteFooter />
    </PageTransition>
  )
}
