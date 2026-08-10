import { useEffect, useRef } from 'react'

type Student = {
  name: string
  average: string
  school: string
  math: string
  physics: string
  science: string
}

const students: Student[] = [
  {
    name: 'عبد الرؤوف سالمي',
    average: '17.42',
    school: 'طالب بالمدرسة الوطنية المتعددة التقنيات',
    math: '19',
    physics: '18.5',
    science: '17',
  },
  {
    name: 'ابتسام يحياوي',
    average: '18.32',
    school: 'طالبة بالمدرسة العليا للإعلام الآلي',
    math: '20',
    physics: '20',
    science: '18.5',
  },
  {
    name: 'عبد الله إسحاق',
    average: '18.92',
    school: 'طالب بالمدرسة العليا للذكاء الاصطناعي',
    math: '20',
    physics: '19.5',
    science: '19',
  },
  {
    name: 'إيناس بن أمغار',
    average: '18.51',
    school: 'طالبة بالمدرسة العليا للذكاء الاصطناعي',
    math: '19',
    physics: '20',
    science: '18',
  },
]

/**
 * TopStudents (المتفوقون)
 * ------------------------------------------------------------------
 * PERFORMANCE REWRITE. The original animated each row with a GSAP
 * ScrollTrigger timeline: blur() filters, staggered fades, an animated
 * scaleX rule and a per-frame number counter. GSAP + ScrollTrigger has been
 * removed entirely; each row now does a single cheap opacity/translateY
 * reveal via one shared IntersectionObserver, and the averages are just
 * rendered directly. Identical layout, far lighter on the phone.
 */
export default function TopStudents() {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const rows = Array.from(root.querySelectorAll<HTMLElement>('.laureate'))

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      rows.forEach((row) => row.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.2 },
    )
    rows.forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="laureates">
      {students.map((student, index) => (
        <article className="laureate" key={student.name}>
          <span className="laureate__ordinal" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>

          <div className="laureate__identity">
            <h3 className="laureate__name">{student.name}</h3>
            <p className="laureate__school">{student.school}</p>
          </div>

          <div className="laureate__average-wrap">
            <span className="laureate__average-label">المعدل</span>
            <span className="laureate__average" dir="ltr">
              {student.average}
            </span>
          </div>

          <ul className="laureate__grades">
            <li>
              <span>الرياضيات</span>
              <strong dir="ltr">{student.math}</strong>
            </li>
            <li>
              <span>الفيزياء</span>
              <strong dir="ltr">{student.physics}</strong>
            </li>
            <li>
              <span>العلوم</span>
              <strong dir="ltr">{student.science}</strong>
            </li>
          </ul>

          <span className="laureate__rule" aria-hidden="true" />
        </article>
      ))}
    </div>
  )
}
