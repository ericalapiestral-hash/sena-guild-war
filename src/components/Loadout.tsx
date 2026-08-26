import type { Hero, LoadoutSlot, SkillPick } from '../types'
import { SKILL_RESERVE_MAX } from '../types'
import { HeroName } from './HeroSelect'
import { ACCESSORIES, ARMOR_OPTIONS, GEAR_SETS, WEAPON_OPTIONS } from '../data/gear'

/**
 * 길드전 방어·공격이 같이 쓰는 입력 부품들.
 * 두 화면의 세팅 항목이 사실상 같아서, 한쪽만 고쳐 서로 어긋나는 걸 막으려고 여기 모았다.
 */

/** 고정 목록에서 하나 고르는 칩 묶음 — 다시 누르면 해제 */
export function Pick({ label, value, options, onPick }: {
  label: string
  value?: string
  options: readonly string[]
  onPick: (v?: string) => void
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

/** 라벨 + 한 줄 입력 */
export function Line({ label, value, onChange, placeholder }: {
  label: string
  value?: string
  onChange: (v?: string) => void
  placeholder?: string
}) {
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <label className="def-label">{label}</label>
      <input value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)} style={{ flex: 1, minWidth: 160 }} />
    </div>
  )
}

/** 영웅 1인의 장비 세팅 (세트·장신구·무기1/2·방어구1/2 + 한 줄 메모) */
export function LoadoutEditor({ slot, hero, onChange }: {
  slot: LoadoutSlot
  hero?: Hero
  onChange: (p: Partial<LoadoutSlot>) => void
}) {
  return (
    <div className="def-slot">
      <div className="def-slot-head"><HeroName hero={hero} name={slot.name} /></div>
      <div className="def-grid">
        <Pick label="장비 세트" value={slot.set} options={GEAR_SETS} onPick={(v) => onChange({ set: v })} />
        <Pick label="장신구" value={slot.accessory} options={ACCESSORIES} onPick={(v) => onChange({ accessory: v })} />
        <Pick label="무기 1" value={slot.weapon1} options={WEAPON_OPTIONS} onPick={(v) => onChange({ weapon1: v })} />
        <Pick label="방어구 1" value={slot.armor1} options={ARMOR_OPTIONS} onPick={(v) => onChange({ armor1: v })} />
        <Pick label="무기 2" value={slot.weapon2} options={WEAPON_OPTIONS} onPick={(v) => onChange({ weapon2: v })} />
        <Pick label="방어구 2" value={slot.armor2} options={ARMOR_OPTIONS} onPick={(v) => onChange({ armor2: v })} />
      </div>
      <input placeholder="그 외 한 줄 (속공 수치·전용장비 등)" value={slot.stat ?? ''}
        onChange={(e) => onChange({ stat: e.target.value || undefined })} style={{ width: '100%', marginTop: 6 }} />
    </div>
  )
}

/** 잠금(보기) 상태의 세팅 한 줄 — 값이 있는 것만 · 로 이어 붙인다 */
export function LoadoutView({ slot, hero }: { slot: LoadoutSlot; hero?: Hero }) {
  const parts = [slot.set, slot.accessory, slot.weapon1, slot.armor1, slot.weapon2, slot.armor2, slot.stat].filter(Boolean)
  return (
    <div className="def-slot">
      <div className="def-slot-head"><HeroName hero={hero} name={slot.name} /></div>
      {parts.length ? <span className="muted">{parts.join(' · ')}</span> : <span className="muted">세팅 미입력</span>}
    </div>
  )
}

/**
 * 스킬 예약 — 덱에 올린 영웅의 실제 스킬 이름 중에서 순서대로 고른다.
 * 예전엔 '겔1 → 팔2' 같은 줄임말을 손으로 적었는데, 영웅 데이터에 스킬 이름이
 * 생겨서 고르게 바꿨다. 줄임말은 사람마다 달라 나중에 못 알아본다.
 */
export function SkillReserve({ slots, heroMap, reserve, onChange }: {
  slots: LoadoutSlot[]
  heroMap: Map<string, Hero>
  reserve?: SkillPick[]
  onChange: (r: SkillPick[]) => void
}) {
  const list = reserve ?? []
  const set = (i: number, p: Partial<SkillPick>) => {
    const next = list.map((x, j) => (j === i ? { ...x, ...p } : x))
    onChange(next)
  }
  const add = () => {
    const first = slots[0]
    if (!first) return
    onChange([...list, { hero: first.name, skill: '' }])
  }

  if (slots.length === 0) {
    return <p className="muted" style={{ margin: '8px 0 0' }}>영웅을 먼저 배치하면 스킬을 고를 수 있어요.</p>
  }

  return (
    <div className="reserve">
      {list.map((r, i) => {
        const hero = heroMap.get(r.hero)
        return (
          <div className="row reserve-row" key={i}>
            <span className="reserve-n">{i + 1}</span>
            <select value={r.hero} onChange={(e) => set(i, { hero: e.target.value, skill: '' })}>
              {slots.map((s) => (
                <option key={s.name} value={s.name}>{heroMap.get(s.name)?.name ?? s.name}</option>
              ))}
            </select>
            <select value={r.skill} onChange={(e) => set(i, { skill: e.target.value })} style={{ flex: 1, minWidth: 120 }}>
              <option value="">— 스킬 선택 —</option>
              {(hero?.skills ?? []).map((s) => (
                <option key={s.name} value={s.name}>{s.name} ({s.type})</option>
              ))}
            </select>
            <button className="small danger" onClick={() => onChange(list.filter((_, j) => j !== i))}>✕</button>
          </div>
        )
      })}
      {list.length < SKILL_RESERVE_MAX && (
        <button className="small" onClick={add}>＋ 스킬 예약 추가 ({list.length}/{SKILL_RESERVE_MAX})</button>
      )}
    </div>
  )
}

/** 보기 상태의 스킬 예약 — 1 겔리두스 창공의 패왕 → 2 … */
export function ReserveView({ reserve, heroMap }: { reserve?: SkillPick[]; heroMap: Map<string, Hero> }) {
  const list = (reserve ?? []).filter((r) => r.skill)
  if (!list.length) return null
  return (
    <span className="reserve-view">
      {list.map((r, i) => (
        <span key={i}>
          {i > 0 && <em className="dsep">→</em>}
          <b>{heroMap.get(r.hero)?.name ?? r.hero}</b> {r.skill}
        </span>
      ))}
    </span>
  )
}
