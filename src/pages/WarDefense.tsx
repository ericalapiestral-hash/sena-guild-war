import { useMemo, useState } from 'react'
import type { DefenseSetup, Hero, LoadoutSlot } from '../types'
import { getAllHeroes, newId, todayLocal, update, useUserData } from '../store'
import { HeroName, HeroPickerModal, SlotRow } from '../components/HeroSelect'
import {
  ACCESSORIES, ARMOR_OPTIONS, DEFENSE_STYLES,
  GEAR_SETS, WAR_DECK_SIZE, WEAPON_OPTIONS,
} from '../data/gear'

/**
 * 길드전 방어 — 우리가 걸어 둘 3v3 방어덱과 그 세팅.
 *
 * 카운터덱(상대 방덱 → 우리 카운터)과 방향이 반대다. 여기 있는 건 '우리가 거는 덱'이다.
 */
export function WarDefensePage() {
  const data = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const list = [...data.defenseSetups].sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))

  function addSetup() {
    const id = newId('def')
    update((d) => {
      d.defenseSetups.push({
        id, name: '새 방어덱', heroes: [], updatedAt: todayLocal(),
      })
    })
    setEditing(id)
    setOpen(id)
  }

  return (
    <div>
      <h1>길드전 방어</h1>
      <p className="page-desc">
        우리가 걸어 둘 <b>3v3 방어덱</b>과 세팅을 정리합니다. 추천도(★)가 높은 순으로 정렬됩니다.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="primary" onClick={addSetup}>+ 방어덱 추가</button>
        <span className="spacer" />
        <span className="muted">{list.length}개</span>
      </div>

      {list.length === 0 && (
        <div className="card muted">아직 등록된 방어덱이 없어요. [+ 방어덱 추가]로 시작하세요.</div>
      )}

      {list.map((s) => (
        <DefenseCard
          key={s.id}
          setup={s}
          heroes={heroes}
          heroMap={heroMap}
          editing={editing === s.id}
          open={open === s.id}
          onToggle={() => setOpen(open === s.id ? null : s.id)}
          onEdit={() => { setEditing(editing === s.id ? null : s.id); setOpen(s.id) }}
        />
      ))}
    </div>
  )
}

const Stars = ({ n }: { n?: number }) => (
  <span className="def-stars" title={`추천도 ${n ?? 0}/5`}>
    {'★'.repeat(n ?? 0)}<span className="muted">{'☆'.repeat(5 - (n ?? 0))}</span>
  </span>
)

function DefenseCard({
  setup, heroes, heroMap, editing, open, onToggle, onEdit,
}: {
  setup: DefenseSetup
  heroes: Hero[]
  heroMap: Map<string, Hero>
  editing: boolean
  open: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const [picking, setPicking] = useState<number | null>(null)

  const patch = (fn: (s: DefenseSetup) => void) =>
    update((d) => {
      const t = d.defenseSetups.find((x) => x.id === setup.id)
      if (t) { fn(t); t.updatedAt = todayLocal() }
    })

  const names = setup.heroes.map((h) => h.name)
  const slotPatch = (i: number, p: Partial<LoadoutSlot>) =>
    patch((s) => { if (s.heroes[i]) Object.assign(s.heroes[i], p) })

  return (
    <div className="card">
      <div className="row between" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <strong>{setup.name}</strong>
          <Stars n={setup.tier} />
          {setup.style && <span className={`badge ${setup.style === '속공' ? 'alt' : 'tier'}`}>{setup.style}</span>}
          {names.length > 0 && (
            <span className="muted">{names.map((n) => <HeroName key={n} hero={heroMap.get(n)} name={n} />)}</span>
          )}
        </div>
        <div className="row">
          <button className="small" onClick={(e) => { e.stopPropagation(); onEdit() }}>{editing ? '편집 끝' : '편집'}</button>
          <button className="small danger" onClick={(e) => {
            e.stopPropagation()
            if (confirm(`'${setup.name}' 방어덱을 삭제할까요?`)) update((d) => { d.defenseSetups = d.defenseSetups.filter((x) => x.id !== setup.id) })
          }}>✕</button>
          <span className="muted">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {editing ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <label className="def-label">덱 이름</label>
                <input value={setup.name} onChange={(e) => patch((s) => { s.name = e.target.value })} style={{ flex: 1, minWidth: 140 }} />
              </div>
              <div className="row" style={{ marginBottom: 8 }}>
                <label className="def-label">추천도</label>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`small ${setup.tier === n ? 'primary' : ''}`}
                    onClick={() => patch((s) => { s.tier = s.tier === n ? undefined : n })}>{n}★</button>
                ))}
                <label className="def-label" style={{ marginLeft: 10 }}>세팅</label>
                {DEFENSE_STYLES.map((v) => (
                  <button key={v} className={`small ${setup.style === v ? 'primary' : ''}`}
                    onClick={() => patch((s) => { s.style = s.style === v ? undefined : v })}>{v}</button>
                ))}
              </div>

              <div className="cc-sec">방어 조합 (최대 {WAR_DECK_SIZE}인)</div>
              <SlotRow
                names={names}
                heroMap={heroMap}
                max={WAR_DECK_SIZE}
                onPick={(i) => setPicking(i)}
                onClear={(i) => patch((s) => { s.heroes.splice(i, 1) })}
              />

              {setup.heroes.map((h, i) => (
                <div className="def-slot" key={i}>
                  <div className="def-slot-head"><HeroName hero={heroMap.get(h.name)} name={h.name} /></div>
                  <div className="def-grid">
                    <Pick label="장비 세트" value={h.set} options={GEAR_SETS} onPick={(v) => slotPatch(i, { set: v })} />
                    <Pick label="장신구" value={h.accessory} options={ACCESSORIES} onPick={(v) => slotPatch(i, { accessory: v })} />
                    <Pick label="무기 1" value={h.weapon1} options={WEAPON_OPTIONS} onPick={(v) => slotPatch(i, { weapon1: v })} />
                    <Pick label="방어구 1" value={h.armor1} options={ARMOR_OPTIONS} onPick={(v) => slotPatch(i, { armor1: v })} />
                    <Pick label="무기 2" value={h.weapon2} options={WEAPON_OPTIONS} onPick={(v) => slotPatch(i, { weapon2: v })} />
                    <Pick label="방어구 2" value={h.armor2} options={ARMOR_OPTIONS} onPick={(v) => slotPatch(i, { armor2: v })} />
                  </div>
                  <input placeholder="그 외 한 줄 (속공 수치·전용장비 등)" value={h.stat ?? ''}
                    onChange={(e) => slotPatch(i, { stat: e.target.value || undefined })} style={{ width: '100%', marginTop: 6 }} />
                </div>
              ))}

              <div className="row" style={{ marginTop: 10 }}>
                <label className="def-label">속공 수치</label>
                <input type="number" className="num-tab" placeholder="이상" value={setup.speedMin ?? ''}
                  onChange={(e) => patch((s) => { s.speedMin = e.target.value === '' ? undefined : Number(e.target.value) })} style={{ width: 110 }} />
                <span className="muted">~</span>
                <input type="number" className="num-tab" placeholder="이하" value={setup.speedMax ?? ''}
                  onChange={(e) => patch((s) => { s.speedMax = e.target.value === '' ? undefined : Number(e.target.value) })} style={{ width: 110 }} />
              </div>

              <Line label="스킬 예약" value={setup.skillOrder} onChange={(v) => patch((s) => { s.skillOrder = v })} placeholder="예: 겔1 → 팔2 → 아리2" />
              <Line label="진형 · 펫" value={setup.formation} onChange={(v) => patch((s) => { s.formation = v })} placeholder="예: 보호진형 / 펫 루" />
              <Line label="부옵 우선순위" value={setup.subStats} onChange={(v) => patch((s) => { s.subStats = v })} placeholder="예: 막기 &gt; 생명 &gt; 방어" />
              <Line label="장신구 요약" value={setup.accessoryNote} onChange={(v) => patch((s) => { s.accessoryNote = v })} placeholder="예: 6부6권" />
              <Line label="기타" value={setup.notes} onChange={(v) => patch((s) => { s.notes = v })} placeholder="주의점·상성 등" />
            </>
          ) : (
            <DefenseView setup={setup} heroMap={heroMap} />
          )}
        </div>
      )}

      {picking !== null && (
        <HeroPickerModal
          heroes={heroes}
          title={`방어 ${picking + 1}번 영웅`}
          selected={names}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            patch((s) => {
              if (s.heroes[picking]) s.heroes[picking].name = id
              else s.heroes.push({ name: id })
            })
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}

/** 고정 목록에서 하나 고르는 칩 묶음 — 다시 누르면 해제 */
function Pick({ label, value, options, onPick }: {
  label: string; value?: string; options: readonly string[]; onPick: (v?: string) => void
}) {
  return (
    <div className="def-pick">
      <span className="def-pick-l">{label}</span>
      <div className="def-pick-o">
        {options.map((o) => (
          <button key={o} className={`chip ${value === o ? 'on' : ''}`} onClick={() => onPick(value === o ? undefined : o)}>{o}</button>
        ))}
      </div>
    </div>
  )
}

function Line({ label, value, onChange, placeholder }: {
  label: string; value?: string; onChange: (v?: string) => void; placeholder?: string
}) {
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <label className="def-label">{label}</label>
      <input value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)} style={{ flex: 1, minWidth: 160 }} />
    </div>
  )
}

/** 잠금(보기) 상태 — 값이 있는 것만 보여 준다 */
function DefenseView({ setup, heroMap }: { setup: DefenseSetup; heroMap: Map<string, Hero> }) {
  const speed = [setup.speedMin, setup.speedMax].some((v) => typeof v === 'number')
    ? `${setup.speedMin ?? ''} ~ ${setup.speedMax ?? ''}`
    : undefined
  const rows: Array<[string, string | undefined]> = [
    ['속공 수치', speed],
    ['스킬 예약', setup.skillOrder],
    ['진형 · 펫', setup.formation],
    ['부옵 우선순위', setup.subStats],
    ['장신구 요약', setup.accessoryNote],
    ['기타', setup.notes],
  ]
  return (
    <>
      {setup.heroes.length === 0 && <p className="muted">영웅이 아직 없어요. [편집]에서 채워 주세요.</p>}
      {setup.heroes.map((h, i) => {
        const parts = [h.set, h.accessory, h.weapon1, h.armor1, h.weapon2, h.armor2, h.stat].filter(Boolean)
        return (
          <div className="def-slot" key={i}>
            <div className="def-slot-head"><HeroName hero={heroMap.get(h.name)} name={h.name} /></div>
            {parts.length ? <span className="muted">{parts.join(' · ')}</span> : <span className="muted">세팅 미입력</span>}
          </div>
        )
      })}
      {rows.filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
        <div className="row" key={k} style={{ marginTop: 6 }}>
          <span className="def-label">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </>
  )
}
