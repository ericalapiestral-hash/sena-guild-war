import { useMemo, useState } from 'react'
import type { CastleDeck, Hero } from '../types'
import { getAllHeroes, newId, update, useUserData } from '../store'
import { DeckLine } from '../components/HeroChip'
import { HeroPicker } from '../components/HeroPicker'

// 거점 구조: 본성 1 · 내성 3 · 외성 5 (배치 우선순위 순으로 표시)
const TIERS: { tier: string; keys: string[]; hint: string }[] = [
  { tier: '본성', keys: ['본성'], hint: '최강 방덱 집중 배치 (예: 여칼클 = 여포·칼헤론·클레미스). 내성 2개 함락 시 공략 가능.' },
  { tier: '내성', keys: ['내성1', '내성2', '내성3'], hint: '2군 강덱. 외성 3개 함락 시 공략 가능.' },
  { tier: '외성', keys: ['외성1', '외성2', '외성3', '외성4', '외성5'], hint: '먼저 뚫리는 관문. 파생·잡덱으로 물량 채우기.' },
]

export function CastlePage() {
  const { castleDecks } = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const [editing, setEditing] = useState<{ key: string; deck: CastleDeck } | null>(null)

  const totalDecks = Object.values(castleDecks).reduce((n, arr) => n + (arr?.length ?? 0), 0)

  return (
    <div>
      <h1>거점 배치</h1>
      <p className="page-desc">
        길드전 거점(성)별로 방어덱을 배치·관리하세요. 현재 <b>{totalDecks}</b>개 배치됨.
        {' '}메이저 최소 60팀 / 마이너 35팀.
      </p>

      {TIERS.map(({ tier, keys, hint }) => (
        <div key={tier} style={{ marginBottom: 18 }}>
          <div className="tier-head">
            <span className={`tier-badge tier-${tier}`}>{tier}</span>
            <span className="muted">{hint}</span>
          </div>
          <div className="castle-grid">
            {keys.map((key) => {
              const decks = castleDecks[key] ?? []
              return (
                <div className="card castle-card" key={key}>
                  <div className="row between">
                    <strong>{key}</strong>
                    <button className="small" onClick={() => setEditing({ key, deck: { id: newId('cd'), heroes: [] } })}>
                      + 덱
                    </button>
                  </div>
                  {decks.length === 0 && <div className="muted" style={{ marginTop: 8 }}>비어 있음</div>}
                  {decks.map((d) => (
                    <div className="castle-deck" key={d.id}>
                      <DeckLine heroIds={d.heroes} heroMap={heroMap} />
                      {d.memo && <div className="muted" style={{ fontSize: '0.82rem' }}>{d.memo}</div>}
                      <div className="row" style={{ marginTop: 4 }}>
                        <button className="small" onClick={() => setEditing({ key, deck: structuredClone(d) })}>수정</button>
                        <button className="small danger" onClick={() => {
                          update((u) => {
                            u.castleDecks[key] = (u.castleDecks[key] ?? []).filter((x) => x.id !== d.id)
                          })
                        }}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {editing && (
        <CastleDeckForm
          heroes={heroes}
          heroMap={heroMap}
          deck={editing.deck}
          castleKey={editing.key}
          onClose={() => setEditing(null)}
          onSave={(deck) => {
            update((u) => {
              const arr = u.castleDecks[editing.key] ?? (u.castleDecks[editing.key] = [])
              const idx = arr.findIndex((x) => x.id === deck.id)
              if (idx >= 0) arr[idx] = deck
              else arr.push(deck)
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function CastleDeckForm({
  heroes,
  heroMap,
  deck,
  castleKey,
  onSave,
  onClose,
}: {
  heroes: Hero[]
  heroMap: Map<string, Hero>
  deck: CastleDeck
  castleKey: string
  onSave: (d: CastleDeck) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<CastleDeck>(deck)

  function toggle(id: string) {
    setDraft((d) => {
      const heroes = d.heroes.includes(id)
        ? d.heroes.filter((x) => x !== id)
        : d.heroes.length < 3
        ? [...d.heroes, id]
        : d.heroes
      return { ...d, heroes }
    })
  }

  return (
    <dialog open style={{ position: 'fixed', top: '8vh', zIndex: 100, left: '50%', transform: 'translateX(-50%)', margin: 0, maxHeight: '84vh', overflowY: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>{castleKey} — 방어덱 배치</h2>
      <div style={{ marginBottom: 10 }}>
        <DeckLine heroIds={draft.heroes} heroMap={heroMap} onRemove={(i) => setDraft((d) => ({ ...d, heroes: d.heroes.filter((_, j) => j !== i) }))} />
      </div>
      <HeroPicker heroes={heroes} selected={draft.heroes} onToggle={toggle} max={3} />
      <input
        placeholder="메모 (담당자, 진형, 주의점...)"
        value={draft.memo ?? ''}
        onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
        style={{ width: '100%', marginTop: 12 }}
      />
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={onClose}>취소</button>
        <button className="primary" disabled={draft.heroes.length === 0} onClick={() => onSave(draft)}>저장</button>
      </div>
    </dialog>
  )
}
