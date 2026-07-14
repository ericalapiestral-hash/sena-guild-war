import { useMemo, useState } from 'react'
import type { CounterDeck, CounterEntry, Formation, Hero } from '../types'
import { canEdit, getAllCounters, getAllHeroes, isBuiltinCounter, newId, update, useUserData } from '../store'
import { DeckLine } from '../components/HeroChip'
import { HeroPicker } from '../components/HeroPicker'

const CONFIDENCES: CounterDeck['confidence'][] = ['검증됨', '커뮤니티', '추측']
const FORMATIONS: Formation[] = ['공격진형', '밸런스진형', '보호진형', '기본진형']

export function CountersPage() {
  useUserData() // 변경 구독
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const counters = getAllCounters()

  const [searchSel, setSearchSel] = useState<string[]>([])
  const [editing, setEditing] = useState<CounterEntry | null>(null)
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    if (searchSel.length === 0) return counters
    // 선택한 영웅이 방어덱 또는 카운터(공격)덱 중 하나에 모두 포함된 엔트리
    return counters.filter(
      (c) =>
        searchSel.every((id) => c.defense.includes(id)) ||
        c.counters.some((ct) => searchSel.every((id) => ct.heroes.includes(id))),
    )
  }, [counters, searchSel])

  function startNew() {
    setEditing({
      id: newId('counter'),
      defense: searchSel.slice(0, 3),
      counters: [],
      updatedAt: new Date().toISOString().slice(0, 10),
    })
    setShowForm(true)
  }

  function startEdit(entry: CounterEntry) {
    setEditing(structuredClone(entry))
    setShowForm(true)
  }

  function remove(entry: CounterEntry) {
    if (!confirm('이 카운터 정보를 삭제할까요?')) return
    update((d) => {
      d.counters = d.counters.filter((c) => c.id !== entry.id)
      if (isBuiltinCounter(entry.id) && !d.hiddenCounterIds.includes(entry.id)) {
        d.hiddenCounterIds.push(entry.id)
      }
    })
  }

  return (
    <div>
      <h1>카운터덱 사전</h1>
      <p className="page-desc">
        영웅을 선택하면 그 영웅이 든 <b>방어덱·카운터(공격)덱을 모두</b> 찾아줍니다. 카운터로 매칭되면 강조 표시돼요.
      </p>

      <div className="card">
        <strong>영웅으로 덱 검색 <span className="muted" style={{ fontWeight: 400 }}>(방덱·카운터 모두)</span></strong>
        <div style={{ marginTop: 8 }}>
          <HeroPicker heroes={heroes} selected={searchSel} max={3}
            onToggle={(id) => setSearchSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted">
            {searchSel.length === 0
              ? `전체 ${counters.length}개 방덱 표시 중`
              : `${filtered.length}개 덱이 선택한 영웅을 포함 (방덱·카운터)`}
          </span>
          {searchSel.length > 0 && (
            <button className="small" onClick={() => setSearchSel([])}>선택 초기화</button>
          )}
          <span className="spacer" />
          {canEdit() ? (
            <button className="primary" onClick={startNew}>+ 새 방어덱/카운터 등록</button>
          ) : (
            <span className="muted">🔒 등록·수정은 운영진만</span>
          )}
        </div>
      </div>

      {filtered.map((entry) => {
        const active = searchSel.length > 0
        const defMatch = active && searchSel.every((id) => entry.defense.includes(id))
        const matched = (c: CounterDeck) => active && searchSel.every((id) => c.heroes.includes(id))
        const onlyCounter = active && !defMatch && entry.counters.some(matched)
        return (
          <div className="card" key={entry.id}>
            <div className="row between">
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  상대 방어덱{entry.defenseFormation ? ` · ${entry.defenseFormation}` : ''}
                </div>
                <DeckLine heroIds={entry.defense} heroMap={heroMap} />
                {onlyCounter && (
                  <div className="badge 커뮤니티" style={{ marginTop: 6 }}>🔎 선택한 영웅 = 이 방덱의 카운터/공격덱</div>
                )}
                {entry.defenseNotes && <div className="muted" style={{ marginTop: 6 }}>{entry.defenseNotes}</div>}
              </div>
              {canEdit() && (
                <div className="row">
                  <button className="small" onClick={() => startEdit(entry)}>수정</button>
                  <button className="small danger" onClick={() => remove(entry)}>삭제</button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              {entry.counters.length === 0 && <span className="muted">등록된 카운터 없음 — [수정]으로 추가하세요</span>}
              {entry.counters.map((c, i) => (
                <div key={i} className={`row ${matched(c) ? 'counter-match' : ''}`} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <span className={`badge ${c.confidence}`}>{c.confidence}</span>
                  <DeckLine heroIds={c.heroes} heroMap={heroMap} />
                  {c.formation && <span className="muted">({c.formation})</span>}
                  {c.notes && <span className="muted" style={{ flexBasis: '100%' }}>💡 {c.notes}</span>}
                </div>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: '0.78rem' }}>업데이트: {entry.updatedAt}</div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="card muted">
          일치하는 덱이 없습니다. [+ 새 방어덱/카운터 등록]으로 지금 검색한 조합을 바로 등록할 수 있어요.
        </div>
      )}

      {showForm && editing && (
        <CounterForm
          entry={editing}
          heroes={heroes}
          heroMap={heroMap}
          onClose={() => setShowForm(false)}
          onSave={(e) => {
            update((d) => {
              const idx = d.counters.findIndex((c) => c.id === e.id)
              e.updatedAt = new Date().toISOString().slice(0, 10)
              if (idx >= 0) d.counters[idx] = e
              else d.counters.push(e)
              d.hiddenCounterIds = d.hiddenCounterIds.filter((id) => id !== e.id)
            })
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function CounterForm({
  entry,
  heroes,
  heroMap,
  onSave,
  onClose,
}: {
  entry: CounterEntry
  heroes: Hero[]
  heroMap: Map<string, Hero>
  onSave: (e: CounterEntry) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<CounterEntry>(entry)
  // 현재 편집 중인 카운터덱 인덱스 (-1 = 방어덱 편집)
  const [target, setTarget] = useState(-1)

  const targetDeck = target === -1 ? draft.defense : draft.counters[target]?.heroes ?? []

  function toggleHero(id: string) {
    setDraft((d) => {
      const next = structuredClone(d)
      const deck = target === -1 ? next.defense : next.counters[target].heroes
      const i = deck.indexOf(id)
      if (i >= 0) deck.splice(i, 1)
      else if (deck.length < 3) deck.push(id)
      return next
    })
  }

  return (
    <dialog open style={{ position: 'fixed', top: '5vh', zIndex: 100, maxHeight: '88vh', overflowY: 'auto', left: '50%', transform: 'translateX(-50%)', margin: 0 }}>
      <h2 style={{ marginTop: 0 }}>방어덱 / 카운터 편집</h2>

      <div className="card" onClick={() => setTarget(-1)}
        style={{ borderColor: target === -1 ? 'var(--accent)' : undefined, cursor: 'pointer' }}>
        <div className="row between">
          <span><strong>상대 방어덱</strong> <span className="muted">(클릭해서 선택 후 아래에서 영웅 지정)</span></span>
          <select value={draft.defenseFormation ?? ''} onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft({ ...draft, defenseFormation: (e.target.value || undefined) as Formation | undefined })}>
            <option value="">진형 미상</option>
            {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 6 }}>
          <DeckLine heroIds={draft.defense} heroMap={heroMap} />
        </div>
        <input
          placeholder="방어덱 특징 메모 (예: 선공 위주, 연희 도발 조심)"
          value={draft.defenseNotes ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft({ ...draft, defenseNotes: e.target.value })}
          style={{ width: '100%', marginTop: 8 }}
        />
      </div>

      {draft.counters.map((c, i) => (
        <div key={i} className="card" onClick={() => setTarget(i)}
          style={{ borderColor: target === i ? 'var(--accent)' : undefined, cursor: 'pointer' }}>
          <div className="row between">
            <strong>카운터덱 {i + 1}</strong>
            <div className="row">
              <select value={c.formation ?? ''} onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const next = structuredClone(draft)
                  next.counters[i].formation = (e.target.value || undefined) as Formation | undefined
                  setDraft(next)
                }}>
                <option value="">진형 미상</option>
                {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={c.confidence} onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const next = structuredClone(draft)
                  next.counters[i].confidence = e.target.value as CounterDeck['confidence']
                  setDraft(next)
                }}>
                {CONFIDENCES.map((cf) => <option key={cf} value={cf}>{cf}</option>)}
              </select>
              <button className="small danger" onClick={(e) => {
                e.stopPropagation()
                const next = structuredClone(draft)
                next.counters.splice(i, 1)
                setDraft(next)
                setTarget(-1)
              }}>삭제</button>
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            <DeckLine heroIds={c.heroes} heroMap={heroMap} />
          </div>
          <textarea
            placeholder="공략 포인트 (스킬 순서, 진형, 주의점...)"
            value={c.notes}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = structuredClone(draft)
              next.counters[i].notes = e.target.value
              setDraft(next)
            }}
            style={{ width: '100%', marginTop: 8, minHeight: 50 }}
          />
        </div>
      ))}

      <button onClick={() => {
        setDraft((d) => ({
          ...d,
          counters: [...d.counters, { heroes: [], notes: '', confidence: '추측' }],
        }))
        setTarget(draft.counters.length)
      }}>+ 카운터덱 추가</button>

      <h2 style={{ fontSize: '1rem' }}>
        영웅 선택 — {target === -1 ? '상대 방어덱' : `카운터덱 ${target + 1}`}에 넣기
      </h2>
      <HeroPicker heroes={heroes} selected={targetDeck} onToggle={toggleHero} max={3} />

      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onClose}>취소</button>
        <button className="primary" disabled={draft.defense.length === 0} onClick={() => onSave(draft)}>
          저장
        </button>
      </div>
    </dialog>
  )
}
