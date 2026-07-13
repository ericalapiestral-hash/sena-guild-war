import { useMemo, useState } from 'react'
import type { Grade, Hero, Position, SavedDeck } from '../types'
import { getAllHeroes, newId, update, useUserData } from '../store'
import { DeckLine, HeroChip } from '../components/HeroChip'
import { HeroPicker } from '../components/HeroPicker'

const GRADES: Grade[] = ['전설', '희귀', '고급', '일반']
const POSITIONS: Position[] = ['공격형', '마법형', '방어형', '지원형', '만능형']

export function HeroesPage() {
  const userData = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])

  return (
    <div>
      <h1>영웅 DB · 덱 빌더</h1>
      <p className="page-desc">영웅을 검색·필터하고, 길드전 3인 덱을 짜서 저장해 두세요.</p>
      <DeckBuilder heroes={heroes} heroMap={heroMap} savedDecks={userData.savedDecks} />
      <HeroTable heroes={heroes} />
    </div>
  )
}

function DeckBuilder({
  heroes,
  heroMap,
  savedDecks,
}: {
  heroes: Hero[]
  heroMap: Map<string, Hero>
  savedDecks: SavedDeck[]
}) {
  const [sel, setSel] = useState<string[]>([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SavedDeck['kind']>('공격덱')
  const [memo, setMemo] = useState('')

  function save() {
    if (sel.length === 0 || !name.trim()) return
    update((d) => {
      d.savedDecks.push({
        id: newId('deck'),
        name: name.trim(),
        heroes: sel,
        memo: memo.trim() || undefined,
        kind,
        updatedAt: new Date().toISOString().slice(0, 10),
      })
    })
    setSel([]); setName(''); setMemo('')
  }

  return (
    <>
      <div className="card">
        <strong>덱 빌더</strong> <span className="muted">— 길드전 파티는 3인, 방어 파티는 1인당 최대 5개</span>
        <div style={{ marginTop: 8 }}>
          <HeroPicker heroes={heroes} selected={sel} max={3}
            onToggle={(id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s)} />
        </div>
        <div style={{ margin: '10px 0' }}>
          <DeckLine heroIds={sel} heroMap={heroMap}
            onRemove={(i) => setSel((s) => s.filter((_, j) => j !== i))} />
        </div>
        <div className="row">
          <input placeholder="덱 이름" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 150 }} />
          <select value={kind} onChange={(e) => setKind(e.target.value as SavedDeck['kind'])}>
            <option value="공격덱">공격덱</option>
            <option value="방어덱">방어덱</option>
          </select>
          <input placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <button className="primary" disabled={sel.length === 0 || !name.trim()} onClick={save}>덱 저장</button>
        </div>
      </div>

      {savedDecks.length > 0 && (
        <div className="card">
          <strong>저장된 덱</strong>
          <div className="table-wrap">
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr><th>이름</th><th>종류</th><th>구성</th><th>메모</th><th /></tr>
              </thead>
              <tbody>
                {savedDecks.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td>{d.kind}</td>
                    <td><DeckLine heroIds={d.heroes} heroMap={heroMap} /></td>
                    <td className="muted">{d.memo}</td>
                    <td>
                      <button className="small danger" onClick={() => {
                        if (confirm(`'${d.name}' 덱을 삭제할까요?`)) {
                          update((u) => { u.savedDecks = u.savedDecks.filter((x) => x.id !== d.id) })
                        }
                      }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function HeroTable({ heroes }: { heroes: Hero[] }) {
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<Position | ''>('')
  const [grade, setGrade] = useState<Grade | ''>('')
  const [pvpOnly, setPvpOnly] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const filtered = heroes.filter((h) => {
    if (q && !h.name.includes(q)) return false
    if (pos && h.position !== pos) return false
    if (grade && h.grade !== grade) return false
    if (pvpOnly && !h.pvpRelevant) return false
    return true
  })

  return (
    <div className="card">
      <div className="row between">
        <strong>영웅 목록 ({filtered.length}/{heroes.length})</strong>
        <button className="small" onClick={() => setShowAdd(true)}>+ 영웅 직접 추가</button>
      </div>
      <div className="row" style={{ margin: '10px 0' }}>
        <input placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 140 }} />
        <select value={grade} onChange={(e) => setGrade(e.target.value as Grade | '')}>
          <option value="">등급 전체</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | '')}>
          <option value="">유형 전체</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={pvpOnly} onChange={(e) => setPvpOnly(e.target.checked)} />
          PvP 주력만
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>영웅</th><th>등급</th><th>유형</th><th>역할</th><th>소속</th><th>PvP</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr key={h.id}>
                <td><HeroChip hero={h} /></td>
                <td>{h.grade}</td>
                <td>{h.position ?? '—'}</td>
                <td className="muted">{h.role ?? ''}</td>
                <td className="muted">{h.tags?.join(', ') ?? ''}</td>
                <td>{h.pvpRelevant ? '⭐' : ''}</td>
                <td>
                  {h.custom && (
                    <button className="small danger" onClick={() => {
                      if (confirm(`'${h.name}' 영웅을 삭제할까요?`)) {
                        update((u) => { u.customHeroes = u.customHeroes.filter((x) => x.id !== h.id) })
                      }
                    }}>삭제</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddHeroForm onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function AddHeroForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [grade, setGrade] = useState<Grade>('전설')
  const [pos, setPos] = useState<Position>('공격형')
  const [role, setRole] = useState('')

  return (
    <dialog open style={{ position: 'fixed', top: '20vh', zIndex: 100, left: '50%', transform: 'translateX(-50%)', margin: 0 }}>
      <h2 style={{ marginTop: 0 }}>영웅 직접 추가</h2>
      <p className="muted">DB에 없는 신규 영웅을 추가할 수 있어요.</p>
      <div className="row">
        <input placeholder="영웅 이름" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value as Position)}>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <input placeholder="역할 한 줄 (선택)" value={role} onChange={(e) => setRole(e.target.value)}
        style={{ width: '100%', marginTop: 10 }} />
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={onClose}>취소</button>
        <button className="primary" disabled={!name.trim()} onClick={() => {
          update((d) => {
            d.customHeroes.push({
              id: newId('hero'),
              name: name.trim(),
              grade, position: pos,
              role: role.trim() || undefined,
              pvpRelevant: true,
              custom: true,
            })
          })
          onClose()
        }}>추가</button>
      </div>
    </dialog>
  )
}
