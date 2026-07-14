import { useMemo, useState, type MouseEvent } from 'react'
import type { CounterDeck, CounterEntry, CounterHeroSlot, Formation, Hero } from '../types'
import {
  canEdit,
  counterHeroNames,
  getAllCounters,
  getAllHeroes,
  isBuiltinCounter,
  newId,
  slotName,
  toSlot,
  update,
  useUserData,
} from '../store'
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
        c.counters.some((ct) => searchSel.every((id) => counterHeroNames(ct).includes(id))),
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
        const isMatched = (c: CounterDeck) => active && searchSel.every((id) => counterHeroNames(c).includes(id))
        const onlyCounter = active && !defMatch && entry.counters.some(isMatched)
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
              {entry.counters.length === 0 && (
                <span className="muted">등록된 카운터 없음{canEdit() ? ' — [수정]으로 추가하세요' : ''}</span>
              )}
              {entry.counters.map((c, i) => (
                <CounterCard key={i} index={i} c={c} heroMap={heroMap} matched={isMatched(c)} />
              ))}
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: '0.78rem' }}>업데이트: {entry.updatedAt}</div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="card muted">
          일치하는 덱이 없습니다.{canEdit() ? ' [+ 새 방어덱/카운터 등록]으로 지금 검색한 조합을 바로 등록할 수 있어요.' : ''}
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
              const today = new Date().toISOString().slice(0, 10)
              e.updatedAt = today
              e.counters.forEach((c) => { if (!c.updatedAt) c.updatedAt = today })
              const idx = d.counters.findIndex((c) => c.id === e.id)
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

/** 카운터덱 1개를 상세 카드로 표시 */
function CounterCard({
  index,
  c,
  heroMap,
  matched,
}: {
  index: number
  c: CounterDeck
  heroMap: Map<string, Hero>
  matched: boolean
}) {
  const slots = (c.heroes || []).map(toSlot)
  return (
    <div className={`counter-card ${matched ? 'counter-match' : ''}`}>
      <div className="cc-eyebrow">카운터덱 #{index + 1}</div>
      <div className="cc-title">{c.name?.trim() || `카운터덱 ${index + 1}`}</div>
      <div className="cc-meta">
        {typeof c.rating === 'number' && <span className="cc-rating">추천도 <b>{c.rating}/10</b></span>}
        <span className={`badge ${c.confidence}`}>{c.confidence}</span>
        {c.updatedAt && <span className="cc-muted">최근 수정 {c.updatedAt}</span>}
      </div>

      <div className="cc-body">
        <div className="cc-main">
          <div className="cc-sec">추천 카운터 영웅</div>
          <div className="cc-heroes">
            {slots.length === 0 && <span className="cc-muted">영웅 미지정</span>}
            {slots.map((s, i) => (
              <HeroSlotCard key={i} slot={s} hero={heroMap.get(s.name)} />
            ))}
          </div>

          <div className="cc-petform">
            <span><span className="cc-k">펫</span> <b>{c.pet?.trim() || '미입력'}</b></span>
            <span><span className="cc-k">진형</span> <b>{c.formation?.trim() || '미입력'}</b></span>
          </div>

          <div className="cc-cols">
            <div className="cc-col">
              <div className="cc-col-h">추천 속공순서</div>
              <div className="cc-col-b">{c.speedOrder?.trim() || '미입력'}</div>
            </div>
            <div className="cc-col">
              <div className="cc-col-h">추천 카운터 팀속공</div>
              <div className="cc-col-b">{c.teamSpeed?.trim() || '미입력'}</div>
            </div>
            <div className="cc-col">
              <div className="cc-col-h">추천 카운터 스킬순서</div>
              <div className="cc-col-b">{c.skillOrder?.trim() || '미입력'}</div>
            </div>
          </div>
        </div>

        <div className="cc-side">
          <div className="cc-col-h">그외 참고사항</div>
          <div className="cc-col-b">{c.notes?.trim() || '메모 없음'}</div>
        </div>
      </div>
    </div>
  )
}

/** 카운터 영웅 1인 카드 (이름 + 반지/장비/스탯) */
function HeroSlotCard({ slot, hero }: { slot: CounterHeroSlot; hero?: Hero }) {
  const pos = hero?.position
  return (
    <div className="hero-slot">
      <div className="hs-name">
        <span className={`pos-dot ${pos ? `pos-${pos}` : 'pos-none'}`} title={pos ?? '유형 미상'} />
        <span>{slot.name}{slot.place ? <span className="hs-place"> ({slot.place})</span> : null}</span>
      </div>
      {slot.ring && <div className="hs-line"><span className="hs-k">반지</span>{slot.ring}</div>}
      {slot.gear && <div className="hs-line"><span className="hs-k">장비</span>{slot.gear}</div>}
      {slot.stat && <div className="hs-stat">{slot.stat}</div>}
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
  // 편집 중에는 카운터 영웅을 항상 상세 슬롯 형태로 정규화
  const [draft, setDraft] = useState<CounterEntry>(() => {
    const d = structuredClone(entry)
    d.counters = d.counters.map((c) => ({ ...c, heroes: (c.heroes || []).map(toSlot) }))
    return d
  })
  // 현재 영웅을 넣을 대상 (-1 = 방어덱, i = 카운터덱 i)
  const [target, setTarget] = useState(-1)

  const targetNames =
    target === -1
      ? draft.defense
      : ((draft.counters[target]?.heroes as CounterHeroSlot[]) ?? []).map(slotName)

  function toggleHero(id: string) {
    setDraft((d) => {
      const next = structuredClone(d)
      if (target === -1) {
        const i = next.defense.indexOf(id)
        if (i >= 0) next.defense.splice(i, 1)
        else if (next.defense.length < 3) next.defense.push(id)
      } else {
        const slots = next.counters[target].heroes as CounterHeroSlot[]
        const i = slots.findIndex((s) => slotName(s) === id)
        if (i >= 0) slots.splice(i, 1)
        else if (slots.length < 3) slots.push({ name: id })
      }
      return next
    })
  }

  function patchCounter(i: number, patch: Partial<CounterDeck>) {
    setDraft((d) => {
      const next = structuredClone(d)
      Object.assign(next.counters[i], patch)
      return next
    })
  }

  function patchSlot(ci: number, si: number, patch: Partial<CounterHeroSlot>) {
    setDraft((d) => {
      const next = structuredClone(d)
      const slots = next.counters[ci].heroes as CounterHeroSlot[]
      Object.assign(slots[si], patch)
      return next
    })
  }

  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <dialog open style={{ position: 'fixed', top: '4vh', zIndex: 100, maxHeight: '90vh', overflowY: 'auto', left: '50%', transform: 'translateX(-50%)', margin: 0 }}>
      <h2 style={{ marginTop: 0 }}>방어덱 / 카운터 편집</h2>

      {/* 상대 방어덱 */}
      <div className="card" onClick={() => setTarget(-1)}
        style={{ borderColor: target === -1 ? 'var(--accent)' : undefined, cursor: 'pointer' }}>
        <div className="row between">
          <span><strong>상대 방어덱</strong> <span className="muted">(클릭 후 아래 목록에서 영웅 선택)</span></span>
          <select value={draft.defenseFormation ?? ''} onClick={stop}
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
          onClick={stop}
          onChange={(e) => setDraft({ ...draft, defenseNotes: e.target.value })}
          style={{ width: '100%', marginTop: 8 }}
        />
      </div>

      {/* 카운터덱들 */}
      {draft.counters.map((c, i) => {
        const slots = c.heroes as CounterHeroSlot[]
        return (
          <div key={i} className="card" onClick={() => setTarget(i)}
            style={{ borderColor: target === i ? 'var(--accent)' : undefined, cursor: 'pointer' }}>
            <div className="row between">
              <strong>카운터덱 {i + 1}{target === i ? ' ✍️' : ''}</strong>
              <div className="row">
                <select value={c.confidence} onClick={stop}
                  onChange={(e) => patchCounter(i, { confidence: e.target.value as CounterDeck['confidence'] })}>
                  {CONFIDENCES.map((cf) => <option key={cf} value={cf}>{cf}</option>)}
                </select>
                <button className="small danger" onClick={(e) => {
                  stop(e)
                  setDraft((d) => { const n = structuredClone(d); n.counters.splice(i, 1); return n })
                  setTarget(-1)
                }}>삭제</button>
              </div>
            </div>

            <div className="form-grid2" onClick={stop} style={{ marginTop: 10 }}>
              <label>덱 별명<input value={c.name ?? ''} placeholder="예: 프목실" onChange={(e) => patchCounter(i, { name: e.target.value })} /></label>
              <label>추천도 (0~10)<input type="number" min={0} max={10} value={c.rating ?? ''} placeholder="예: 8"
                onChange={(e) => patchCounter(i, { rating: e.target.value === '' ? undefined : Math.max(0, Math.min(10, Number(e.target.value))) })} /></label>
            </div>

            <div className="muted" style={{ marginTop: 12, marginBottom: 2 }}>
              카운터 영웅 {slots.length}/3 <span className="cc-muted">— 이 카드를 선택하고 아래 목록에서 영웅을 고르면 슬롯이 생겨요</span>
            </div>
            {slots.length === 0 && <div className="cc-muted" style={{ margin: '4px 0' }}>아래 영웅 목록에서 선택하세요.</div>}
            {slots.map((s, si) => (
              <div key={si} className="slot-edit" onClick={stop}>
                <div className="slot-edit-name">
                  <span className={`pos-dot ${heroMap.get(s.name)?.position ? `pos-${heroMap.get(s.name)!.position}` : 'pos-none'}`} />
                  <b>{s.name}</b>
                  <button className="small danger" style={{ marginLeft: 'auto' }}
                    onClick={() => patchCounter(i, { heroes: (c.heroes as CounterHeroSlot[]).filter((_, x) => x !== si) })}>빼기</button>
                </div>
                <div className="slot-edit-inputs">
                  <input placeholder="배치 (전방/후방/각성…)" value={s.place ?? ''} onChange={(e) => patchSlot(i, si, { place: e.target.value })} />
                  <input placeholder="반지 (예: 쿨권 or 권기)" value={s.ring ?? ''} onChange={(e) => patchSlot(i, si, { ring: e.target.value })} />
                  <input placeholder="장비 (예: 추적자 치약100 모공최대)" value={s.gear ?? ''} onChange={(e) => patchSlot(i, si, { gear: e.target.value })} />
                  <input placeholder="스탯 (예: 극속공, 막기최대)" value={s.stat ?? ''} onChange={(e) => patchSlot(i, si, { stat: e.target.value })} />
                </div>
              </div>
            ))}

            <div className="form-grid2" onClick={stop} style={{ marginTop: 12 }}>
              <label>펫<input value={c.pet ?? ''} placeholder="예: 멜페로" onChange={(e) => patchCounter(i, { pet: e.target.value })} /></label>
              <label>진형<input list="cc-formations" value={c.formation ?? ''} placeholder="예: 보호진형(멜키르)" onChange={(e) => patchCounter(i, { formation: e.target.value })} /></label>
              <label>추천 카운터 팀속공<input value={c.teamSpeed ?? ''} placeholder="예: 290이상 / 극내실" onChange={(e) => patchCounter(i, { teamSpeed: e.target.value })} /></label>
              <label>추천 카운터 스킬순서<input value={c.skillOrder ?? ''} placeholder="예: 오목1 → 프레2 → 오목2" onChange={(e) => patchCounter(i, { skillOrder: e.target.value })} /></label>
            </div>
            <label className="fld" onClick={stop}>추천 속공순서 <span className="cc-muted">(줄바꿈으로 순서)</span>
              <textarea value={c.speedOrder ?? ''} placeholder={'예:\n실베스타\n프레이야\n오목'}
                onChange={(e) => patchCounter(i, { speedOrder: e.target.value })} style={{ minHeight: 44 }} /></label>
            <label className="fld" onClick={stop}>그외 참고사항
              <textarea value={c.notes} placeholder="주의점·팁 등"
                onChange={(e) => patchCounter(i, { notes: e.target.value })} style={{ minHeight: 44 }} /></label>
          </div>
        )
      })}

      <button onClick={() => {
        setDraft((d) => ({ ...d, counters: [...d.counters, { heroes: [], notes: '', confidence: '커뮤니티' }] }))
        setTarget(draft.counters.length)
      }}>+ 카운터덱 추가</button>

      <h2 style={{ fontSize: '1rem' }}>
        영웅 선택 — {target === -1 ? '상대 방어덱' : `카운터덱 ${target + 1}`}에 넣기
      </h2>
      <HeroPicker heroes={heroes} selected={targetNames} onToggle={toggleHero} max={3} />

      <datalist id="cc-formations">{FORMATIONS.map((f) => <option key={f} value={f} />)}</datalist>

      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onClose}>취소</button>
        <button className="primary" disabled={draft.defense.length === 0} onClick={() => onSave(draft)}>
          저장
        </button>
      </div>
    </dialog>
  )
}
