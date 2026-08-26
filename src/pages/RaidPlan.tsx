import { useMemo, useState } from 'react'
import type { AttackDeck, Hero, LoadoutSlot, RaidPlan } from '../types'
import { getAllHeroes, newId, rosterNames, todayLocal, update, useUserData } from '../store'
import { HeroName, HeroPickerModal, SlotRow } from '../components/HeroSelect'
import { Line, LoadoutEditor, LoadoutView, SkillTimeline, TimelineView } from '../components/Loadout'
import { RAID_SLOTS, RAID_STAGES, SIEGE_DECK_SIZE } from '../data/gear'

/**
 * 강림 원정대 배치 — 단계마다 누가 들어갈지 정하고, 그 단계 공략을 붙인다.
 *
 * [파괴신] 메뉴는 딜량 기록이고 여기는 '누가 어느 단계를 맡는가'다.
 * 지금까지는 길드원 메모에 손으로 적어 왔다.
 */
export function RaidPlanPage() {
  const data = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const roster = rosterNames(data.members)
  const [stage, setStage] = useState<string>(RAID_STAGES[0])
  const [openDeck, setOpenDeck] = useState<string | null>(null)

  const plan = data.raidPlans.find((p) => p.stage === stage)

  /** 이 단계 계획을 없으면 만들고 나서 고친다 */
  const patch = (fn: (p: RaidPlan) => void) =>
    update((d) => {
      let t = d.raidPlans.find((x) => x.stage === stage)
      if (!t) {
        t = { id: newId('raid'), stage, assigned: [], decks: [], updatedAt: todayLocal() }
        d.raidPlans.push(t)
      }
      fn(t)
      t.updatedAt = todayLocal()
    })

  const assigned = plan?.assigned ?? []
  const toggle = (n: string) =>
    patch((p) => {
      p.assigned = p.assigned.includes(n)
        ? p.assigned.filter((x) => x !== n)
        : p.assigned.length >= RAID_SLOTS ? p.assigned : [...p.assigned, n]
    })

  function addDeck() {
    const id = newId('raiddeck')
    patch((p) => { p.decks.push({ id, name: '새 공략', heroes: [] }) })
    setOpenDeck(id)
  }

  // 이미 다른 단계에 배치된 사람 — 겹치면 실제로 한 명이 두 곳을 못 뛴다
  const elsewhere = new Map<string, string>()
  for (const p of data.raidPlans) {
    if (p.stage === stage) continue
    for (const n of p.assigned) elsewhere.set(n, p.stage)
  }

  return (
    <div>
      <h1>강림 원정대 배치</h1>
      <p className="page-desc">
        단계마다 <b>누가 들어갈지</b>를 최대 {RAID_SLOTS}명까지 정하고, 그 단계 공략을 답니다.
        딜량 기록은 <b>[파괴신]</b> 메뉴에 있어요.
      </p>

      <div className="stage-tabs">
        {RAID_STAGES.map((s) => {
          const p = data.raidPlans.find((x) => x.stage === s)
          return (
            <button key={s} className={`stage-tab ${stage === s ? 'on' : ''}`} onClick={() => setStage(s)}>
              <span className="stage-name">{s}</span>
              <em className="muted">{(p?.assigned ?? []).length}/{RAID_SLOTS}명 · 공략 {(p?.decks ?? []).length}</em>
            </button>
          )
        })}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between">
          <strong style={{ fontSize: '1.05rem' }}>{stage}</strong>
          <span className="muted">배치 {assigned.length}/{RAID_SLOTS}명</span>
        </div>

        <div className="cc-sec" style={{ marginTop: 12 }}>길드원 배치</div>
        {roster.length === 0 ? (
          <p className="muted">[길드원] 메뉴에 등록된 사람이 없어요.</p>
        ) : (
          <div className="raid-members">
            {roster.map((n) => {
              const on = assigned.includes(n)
              const other = elsewhere.get(n)
              return (
                <button
                  key={n}
                  className={`raid-member ${on ? 'on' : ''} ${!on && other ? 'taken' : ''}`}
                  title={!on && other ? `${other}에 이미 배치됨` : undefined}
                  onClick={() => toggle(n)}
                >
                  {n}
                  {!on && other && <em>·{other.replace('파괴의 그림자 ', '')}</em>}
                </button>
              )
            })}
          </div>
        )}
        {assigned.length >= RAID_SLOTS && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
            {RAID_SLOTS}명이 다 찼어요. 바꾸려면 먼저 누군가를 빼주세요.
          </p>
        )}

        <div className="row between" style={{ marginTop: 16, marginBottom: 6 }}>
          <div className="cc-sec">이 단계 공략 {(plan?.decks ?? []).length}개</div>
          <button className="small primary" onClick={addDeck}>+ 공략 추가</button>
        </div>
        {(plan?.decks ?? []).length === 0 && <p className="muted">아직 공략이 없어요.</p>}
        {(plan?.decks ?? []).map((deck) => (
          <RaidDeckCard
            key={deck.id}
            stage={stage}
            deck={deck}
            heroes={heroes}
            heroMap={heroMap}
            open={openDeck === deck.id}
            onToggle={() => setOpenDeck(openDeck === deck.id ? null : deck.id)}
          />
        ))}

        <Line label="단계 메모" value={plan?.memo} onChange={(v) => patch((p) => { p.memo = v })} placeholder="예: 각성 스킬 아끼기" />
      </div>
    </div>
  )
}

function RaidDeckCard({ stage, deck, heroes, heroMap, open, onToggle }: {
  stage: string
  deck: AttackDeck
  heroes: Hero[]
  heroMap: Map<string, Hero>
  open: boolean
  onToggle: () => void
}) {
  const [picking, setPicking] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)

  const patch = (fn: (d: AttackDeck) => void) =>
    update((d) => {
      const p = d.raidPlans.find((x) => x.stage === stage)
      const k = p?.decks.find((x) => x.id === deck.id)
      if (p && k) { fn(k); p.updatedAt = todayLocal() }
    })

  const names = deck.heroes.map((h) => h.name)
  const slotPatch = (i: number, p: Partial<LoadoutSlot>) =>
    patch((k) => { if (k.heroes[i]) Object.assign(k.heroes[i], p) })

  const rows: Array<[string, string | undefined]> = [
    ['진형', deck.formation],
    ['펫', deck.pet],
    ['공략 포인트', deck.notes],
  ]

  return (
    <div className="atk-deck">
      <div className="row between" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <strong>{deck.name || '이름 없는 공략'}</strong>
          {names.length > 0 && (
            <span className="muted">{names.map((n) => <HeroName key={n} hero={heroMap.get(n)} name={n} />)}</span>
          )}
        </div>
        <div className="row">
          <button className="small" onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); if (!open) onToggle() }}>
            {editing ? '편집 끝' : '편집'}
          </button>
          <button className="small danger" onClick={(e) => {
            e.stopPropagation()
            if (confirm('이 공략을 삭제할까요?')) {
              update((d) => {
                const p = d.raidPlans.find((x) => x.stage === stage)
                if (p) p.decks = p.decks.filter((x) => x.id !== deck.id)
              })
            }
          }}>✕</button>
          <span className="muted">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {editing ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <label className="def-label">공략 이름</label>
                <input value={deck.name ?? ''} onChange={(e) => patch((k) => { k.name = e.target.value })}
                  placeholder="예: 딜 순환덱" style={{ flex: 1, minWidth: 140 }} />
              </div>

              <div className="cc-sec">편성 (최대 {SIEGE_DECK_SIZE}인)</div>
              <SlotRow
                names={names}
                heroMap={heroMap}
                max={SIEGE_DECK_SIZE}
                onPick={(i) => setPicking(i)}
                onClear={(i) => patch((k) => {
                  const gone = k.heroes[i]?.name
                  k.heroes.splice(i, 1)
                  if (gone) k.timeline = (k.timeline ?? []).filter((s) => s.hero !== gone)
                })}
              />

              {deck.heroes.map((h, i) => (
                <LoadoutEditor key={i} slot={h} hero={heroMap.get(h.name)} onChange={(p) => slotPatch(i, p)} />
              ))}

              <div className="cc-sec" style={{ marginTop: 12 }}>스킬 시전 순서</div>
              <SkillTimeline
                slots={deck.heroes}
                heroMap={heroMap}
                timeline={deck.timeline}
                onChange={(t) => patch((k) => { k.timeline = t })}
              />

              <Line label="진형" value={deck.formation} onChange={(v) => patch((k) => { k.formation = v })} placeholder="예: 공격진형" />
              <Line label="펫" value={deck.pet} onChange={(v) => patch((k) => { k.pet = v })} placeholder="예: 카람" />
              <Line label="공략 포인트" value={deck.notes} onChange={(v) => patch((k) => { k.notes = v })} placeholder="주의점·순서 등" />
            </>
          ) : (
            <>
              {deck.heroes.length === 0 && <p className="muted">영웅이 아직 없어요. [편집]에서 채워 주세요.</p>}
              {deck.heroes.map((h, i) => <LoadoutView key={i} slot={h} hero={heroMap.get(h.name)} />)}
              {(deck.timeline ?? []).some((s) => s.skill) && (
                <div style={{ marginTop: 10 }}>
                  <span className="def-label">스킬 시전 순서</span>
                  <TimelineView timeline={deck.timeline} heroMap={heroMap} />
                </div>
              )}
              {rows.filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
                <div className="row" key={k} style={{ marginTop: 6 }}>
                  <span className="def-label">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {picking !== null && (
        <HeroPickerModal
          heroes={heroes}
          title={`편성 ${picking + 1}번 영웅`}
          selected={names}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            patch((k) => {
              if (k.heroes[picking]) k.heroes[picking].name = id
              else k.heroes.push({ name: id })
            })
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}
