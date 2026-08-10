import { motion } from 'framer-motion'
import { ArrowUpLeft, BadgeCheck, BookOpenCheck, BrainCircuit, Check, Clock3, Coins, FileCheck2, Files, Lightbulb, Sparkles, Target, Trophy } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import Reveal from '../components/Reveal'
import SiteFooter from '../components/SiteFooter'

const offerings = [
  { icon: BookOpenCheck, title: 'ملخصات شاملة', text: 'زبدة كل درس، مرتّبة لتفهم أسرع وتراجع بثقة.' },
  { icon: FileCheck2, title: 'سلاسل تمارين مصححة', text: 'تدرّج ذكي من تثبيت الفكرة إلى إتقان الأسئلة المركّبة.' },
  { icon: Trophy, title: 'مواضيع وبكالوريا مصححة', text: 'حلول منهجية تكشف لك كيف تُبنى الإجابة التي تحصد النقاط.' },
  { icon: Files, title: 'دروس لكل المواد', text: 'مصادر منتقاة للشُعب والمواد التي تصنع فرقًا في معدّلك.' },
  { icon: BrainCircuit, title: 'خرائط ذهنية', text: 'اربط الأفكار بصريًا، واسترجعها بسهولة عندما تحتاجها.' },
  { icon: Lightbulb, title: 'نصائح من المتفوقين', text: 'خطوات عملية من طلبة عاشوا التجربة وحققوا نتائج استثنائية.' },
]

export default function SubscriptionPage() {
  return (
    <PageTransition>
      <section className="subscription-hero page-pad relative px-5 pb-24 pt-36 lg:px-10 lg:pb-36 lg:pt-48">
        <div className="mx-auto max-w-7xl text-center">
          <motion.span className="eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><Sparkles size={14} /> استثمار صغير في عام يصنع مستقبلك</motion.span>
          <motion.h1 className="subscription-title" initial={{ opacity: 0, y: 34, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.9 }}>
            كل ما تحتاجه لتصل.<br /><span>ولا شيء يشتّت طريقك.</span>
          </motion.h1>
          <motion.p className="mx-auto mt-7 max-w-2xl text-lg leading-9 text-white/55" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            لأن وقتك في سنة البكالوريا أثمن من أن يضيع بين المصادر، جمعنا لك مكتبة متكاملة، منظّمة، ومبنية لترافقك من أول مراجعة إلى آخر دقيقة قبل الامتحان.
          </motion.p>
        </div>
      </section>

      <section className="px-5 pb-28 lg:px-10 lg:pb-40">
        <div className="stats-ribbon mx-auto max-w-7xl">
          <Reveal className="stat-hero">
            <span className="stat-hero__plus">+</span><strong>400</strong><small>ملف منتقى بعناية</small>
          </Reveal>
          <div className="stat-divider" />
          <Reveal className="stat-message" delay={0.1}>
            <p>مكتبة واحدة.</p><h2>بدل مئات الروابط المبعثرة.</h2>
          </Reveal>
        </div>
      </section>

      <section className="section-shell px-5 py-24 lg:px-10 lg:py-36">
        <div className="mx-auto max-w-7xl">
          <Reveal className="max-w-3xl">
            <span className="section-index">داخل اشتراكك</span>
            <h2 className="section-title mt-6">محتوى صُمّم ليحرّكك إلى الأمام.</h2>
          </Reveal>
          <div className="offering-grid mt-14">
            {offerings.map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={(index % 3) * 0.08}>
                <motion.article className="offering-card" whileHover={{ y: -8 }}>
                  <div className="offering-card__number">0{index + 1}</div>
                  <span className="offering-card__icon"><Icon size={24} /></span>
                  <h3>{title}</h3><p>{text}</p>
                  <div className="offering-card__line" />
                </motion.article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="value-section px-5 py-28 lg:px-10 lg:py-44">
        <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-2 lg:items-center">
          <Reveal direction="right">
            <span className="section-index">القيمة الحقيقية</span>
            <h2 className="section-title mt-6">أنت لا تشتري ملفات.<br />أنت تستعيد وقتك.</h2>
            <p className="section-copy mt-6">وتتخلّص من كلفة الطباعة العشوائية، والدروس المتفرقة، وساعات البحث التي لا تُضيف نقطة واحدة إلى معدلك.</p>
          </Reveal>
          <div className="value-list">
            {[
              { icon: Clock3, title: 'وفّر ساعات كل أسبوع', text: 'كل ما تبحث عنه موجود، مصنّف، وجاهز للمراجعة.' },
              { icon: Coins, title: 'وفّر تكلفة المصادر المتفرقة', text: 'حل واحد متكامل بدل إنفاق متكرر بلا خطة واضحة.' },
              { icon: Target, title: 'ركّز على ما يرفع معدّلك', text: 'محتوى منتقى، لا كومة ملفات لا تعرف من أين تبدأها.' },
            ].map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={index * 0.1} direction="left">
                <article className="value-item"><span><Icon size={22} /></span><div><h3>{title}</h3><p>{text}</p></div></article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-28 lg:px-10 lg:pb-40">
        <Reveal>
          <div className="decision-card mx-auto max-w-6xl">
            <div className="decision-card__shine" />
            <div className="relative z-10">
              <span className="eyebrow"><BadgeCheck size={14} /> الخيار الأذكى لسنة استثنائية</span>
              <h2>لا تدع التشتّت يقرّر نتيجتك.</h2>
              <p>خلف هذا الزر بداية أكثر هدوءًا، خطة أوضح، ومكتبة صُنعت على يد طلاب نجحوا بالفعل. تواصل معنا الآن واعرف تفاصيل الاشتراك.</p>
              <ul>
                {['وصول إلى مكتبة +400 ملف', 'مصادر منظّمة لكل مراحل المراجعة', 'تجربة مبنية من نجاح حقيقي'].map((item) => <li key={item}><Check size={16} /> {item}</li>)}
              </ul>
              <motion.a
                href="https://www.tiktok.com/@abderahmane.lovenature"
                target="_blank"
                rel="noreferrer"
                className="button-primary decision-cta"
                whileHover={{ scale: 1.025 }}
                whileTap={{ scale: 0.98 }}
              >
                تواصل واشترك عبر TikTok <ArrowUpLeft size={19} />
              </motion.a>
              <small>خطوتك الأولى لا تحتاج أكثر من رسالة.</small>
            </div>
          </div>
        </Reveal>
      </section>
      <SiteFooter />
    </PageTransition>
  )
}
