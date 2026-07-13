import { useMemo, useState } from 'react'
import type { Element, Grade, Hero } from '../types'
import { HeroChip } from './HeroChip'

const ELEMENTS: Element[] = ['불', '물', '땅', '빛', '암']
const GRADES: Grade[] = ['전설', '희귀', '고급', '일반']

/** 영웅 검색 + 클릭 선택 그리드. selected에 이미 있으면 해제. */
export function HeroPicker({
  heroes,
  selected,
  onToggle,
  max = 5,
}: {
  heroes: Hero[]
  selected: string[]
  onToggle: (heroId: string) => void
  max?: number
}) {
  const [q, setQ] = useState('')
  const [el, setEl] = useState<Element | ''>('')
  const [grade, setGrade] = useState<Grade | ''>('')
  const [pvpOnly, setPvpOnly] = useState(false)

  const filtered = useMemo(() => {
    return heroes.filter((h) => {
      if (q && !h.name.includes(q)) return false
      if (el && h.element !== el) return false
      if (grade && h.grade !== grade) return false
      if (pvpOnly && !h.pvpRelevant) return false
      return true
    })
  }, [heroes, q, el, grade, pvpOnly])

  const full = selected.length >= max

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          placeholder="영웅 이름 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 160 }}
        />
        <select value={el} onChange={(e) => setEl(e.target.value as Element | '')}>
          <option value="">속성 전체</option>
          {ELEMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={grade} onChange={(e) => setGrade(e.target.value as Grade | '')}>
          <option value="">등급 전체</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={pvpOnly} onChange={(e) => setPvpOnly(e.target.checked)} />
          PvP 주력만
        </label>
        <span className="muted">{selected.length}/{max}명 선택</span>
      </div>
      <div className="hero-picker">
        {filtered.length === 0 && <span className="muted">조건에 맞는 영웅이 없습니다</span>}
        {filtered.map((h) => {
          const isSel = selected.includes(h.id)
          return (
            <HeroChip
              key={h.id}
              hero={h}
              className={isSel ? 'selected' : full ? 'dimmed' : ''}
              onClick={() => {
                if (isSel || !full) onToggle(h.id)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
