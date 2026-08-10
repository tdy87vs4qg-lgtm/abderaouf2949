import { motion, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'

type Paper = {
  text: string
  tint: 'cream' | 'mint' | 'blush' | 'sky'
  rotate: number
  clip: string
}

const papers: Paper[] = [
  { text: 'ملخصات شاملة لجميع المواد', tint: 'cream', rotate: -6, clip: 'حفظ' },
  { text: 'كتب في جميع المواد مع تمارين مأخوذة من مواضيع أشبال الأمة بالتصحيح المفصل', tint: 'mint', rotate: 4, clip: 'تمارين' },
  { text: 'سلاسل تمارين في الرياضيات شاملة كلها بالتصحيح المفصل', tint: 'sky', rotate: -3, clip: 'رياضيات' },
  { text: 'مواضيع أشبال الأمة وثانوية الرياضيات', tint: 'blush', rotate: 7, clip: 'مواضيع' },
  { text: 'مخططات وملخصات لتسهيل الحفظ', tint: 'cream', rotate: -5, clip: 'مخططات' },
  { text: 'أكثر من 400 ملف منظم ومختار بعناية', tint: 'mint', rotate: 3, clip: '+400' },
  { text: 'نصائح وطرق للمراجعة والتفوق', tint: 'sky', rotate: -4, clip: 'نصائح' },
]

export default function DraggablePapers() {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

  return (
    <div className="papers-desk">
      <div className="papers-desk__grain" aria-hidden="true" />

      <div className="papers-board" ref={boardRef}>
        {papers.map((paper, index) => (
          <motion.article
            key={paper.text}
            className={`paper paper--${paper.tint}`}
            style={{ zIndex: index + 1, rotate: paper.rotate }}
            drag={!reduceMotion}
            dragConstraints={boardRef}
            dragElastic={0.16}
            dragTransition={{ bounceStiffness: 200, bounceDamping: 24 }}
            whileDrag={{ scale: 1.04, zIndex: 40, cursor: 'grabbing' }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-6%' }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: Math.min(index * 0.05, 0.3) }}
          >
            <span className="paper__pin" aria-hidden="true" />
            <span className="paper__tape" aria-hidden="true" />
            <span className="paper__clip">{paper.clip}</span>
            <p className="paper__text">{paper.text}</p>
            <span className="paper__ruling" aria-hidden="true" />
          </motion.article>
        ))}
      </div>
    </div>
  )
}
