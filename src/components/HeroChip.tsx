import type { Hero } from '../types'

export function HeroChip({
  hero,
  name,
  onRemove,
  onClick,
  className,
}: {
  hero?: Hero
  /** 영웅 DB에 없는 이름도 표시할 수 있게 */
  name?: string
  onRemove?: () => void
  onClick?: () => void
  className?: string
}) {
  const pos = hero?.position
  const display = hero?.name ?? name ?? '?'
  return (
    <span
      className={`hero-chip ${hero?.grade === '전설' ? 'grade-전설' : ''} ${className ?? ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <span className={`pos-dot ${pos ? `pos-${pos}` : 'pos-none'}`} title={pos ?? '유형 미상'} />
      {display}
      {hero?.grade === '전설' && <span className="grade-mark">★</span>}
      {onRemove && (
        <button title="제거" onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</button>
      )}
    </span>
  )
}

export function DeckLine({
  heroIds,
  heroMap,
  onRemove,
}: {
  heroIds: string[]
  heroMap: Map<string, Hero>
  onRemove?: (index: number) => void
}) {
  if (heroIds.length === 0) return <span className="muted">(영웅 없음)</span>
  return (
    <span className="deck-line">
      {heroIds.map((id, i) => (
        <HeroChip
          key={`${id}-${i}`}
          hero={heroMap.get(id)}
          name={id}
          onRemove={onRemove ? () => onRemove(i) : undefined}
        />
      ))}
    </span>
  )
}
