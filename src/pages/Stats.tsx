import { useState } from 'react'
import type { StatEntry, StatRound, UserData } from '../types'
import { newId, update, useUserData } from '../store'
import { isAdmin } from '../auth'

type Kind = 'siege' | 'destroyer'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const todayWeekday = () => WEEKDAYS[(new Date().getDay() + 6) % 7]

const CFG: Record<
  Kind,
  { title: string; desc: string; metric: string; field: 'siegeRounds' | 'destroyerRounds'; byDay: boolean; roundName: string; showJoined: boolean; deltaLabel: string }
> = {
  siege: {
    title: '공성전 통계',
    desc: '주차를 고르고 요일(월~일)마다 길드원 점수를 기록해요. 각 요일 점수를 지난주 같은 요일과 비교해 등락(%)이 표시돼요. 명단은 [길드원] 메뉴에 등록된 사람이 자동으로 들어옵니다.',
    metric: '점수',
    field: 'siegeRounds',
    byDay: true,
    roundName: '주차',
    showJoined: false,
    deltaLabel: '전주 대비',
  },
  destroyer: {
    title: '파괴신 통계',
    desc: '회차별로 길드원 딜량을 기록해요. 각 회차를 직전 회차와 비교해 등락(%)이 표시돼요. 명단은 [길드원] 메뉴에 등록된 사람이 자동으로 들어옵니다.',
    metric: '딜량',
    field: 'destroyerRounds',
    byDay: false,
    roundName: '회차',
    showJoined: true,
    deltaLabel: '전 회차 대비',
  },
}

const fmt = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString() : '-')

export function StatsPage({ kind }: { kind: Kind }) {
  const data = useUserData()
  const cfg = CFG[kind]
  const rounds = data[cfg.field]
  const admin = isAdmin()
  const roster = data.members.map((m) => m.name) // [길드원] 메뉴 명단 = 자동 표시

  const [selId, setSelId] = useState<string | null>(null)
  const [day, setDay] = useState<string>(todayWeekday())
  const current = rounds.find((r) => r.id === selId) ?? rounds[rounds.length - 1] ?? null

  // 이 회차/요일에 저장된 값들 (이름 → 기록)
  const stored: StatEntry[] = current ? (cfg.byDay ? current.days?.[day] ?? [] : current.entries) : []

  // 직전 주차(회차) 같은 요일과 비교
  const currentIndex = current ? rounds.findIndex((r) => r.id === current.id) : -1
  const prevRound = currentIndex > 0 ? rounds[currentIndex - 1] : undefined
  const prevList: StatEntry[] = prevRound ? (cfg.byDay ? prevRound.days?.[day] ?? [] : prevRound.entries) : []
  const prevValues = new Map(prevList.filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]))

  function patchRounds(fn: (rs: StatRound[]) => void) {
    update((d: UserData) => { fn(d[cfg.field]) })
  }
  function patchRound(roundId: string, fn: (r: StatRound) => void) {
    patchRounds((rs) => { const r = rs.find((x) => x.id === roundId); if (r) fn(r) })
  }
  /** 현재 회차/요일의 저장 배열을 확보해 조작 */
  function editStored(fn: (list: StatEntry[]) => void) {
    if (!current) return
    patchRound(current.id, (r) => {
      if (cfg.byDay) {
        if (!r.days) r.days = {}
        if (!r.days[day]) r.days[day] = []
        fn(r.days[day])
      } else {
        fn(r.entries)
      }
    })
  }

  function addRound() {
    const label = prompt(`${cfg.roundName} 이름을 입력하세요. (예: ${cfg.byDay ? '7월 2주 / 시즌 12' : '1회차 / 시즌 12'})`)?.trim()
    if (!label) return
    const id = newId(kind)
    patchRounds((rs) => rs.push({ id, label, date: new Date().toISOString().slice(0, 10), entries: [], ...(cfg.byDay ? { days: {} } : {}) }))
    setSelId(id)
  }
  function renameRound(r: StatRound) {
    const label = prompt(`${cfg.roundName} 이름 변경`, r.label)?.trim()
    if (label) patchRound(r.id, (x) => { x.label = label })
  }
  function deleteRound(r: StatRound) {
    if (!confirm(`'${r.label}' ${cfg.roundName}를 삭제할까요? (기록 전체가 사라져요)`)) return
    patchRounds((rs) => { const i = rs.findIndex((x) => x.id === r.id); if (i >= 0) rs.splice(i, 1) })
    setSelId(null)
  }

  // 이름 기준 upsert
  const setEntry = (name: string, patch: Partial<StatEntry>) => {
    editStored((l) => { let e = l.find((x) => x.name === name); if (!e) { e = { name }; l.push(e) } Object.assign(e, patch) })
  }
  const addName = (name: string) => {
    const n = name.trim()
    if (!n) return
    editStored((l) => { if (!l.some((x) => x.name === n)) l.push({ name: n }) })
  }
  const removeName = (name: string) => {
    editStored((l) => { const i = l.findIndex((x) => x.name === name); if (i >= 0) l.splice(i, 1) })
  }

  return (
    <div>
      <h1>{cfg.title}</h1>
      <p className="page-desc">{cfg.desc}</p>

      {/* 주차/회차 선택 */}
      <div className="row" style={{ marginBottom: 12 }}>
        {rounds.map((r) => (
          <button key={r.id} className={`small ${current?.id === r.id ? 'primary' : ''}`} onClick={() => setSelId(r.id)}>
            {r.label}
          </button>
        ))}
        {rounds.length === 0 && <span className="muted">아직 {cfg.roundName}가 없어요.</span>}
        <span className="spacer" />
        {admin ? (
          <button className="primary" onClick={addRound}>+ 새 {cfg.roundName}</button>
        ) : (
          <span className="muted">🔒 입력·수정은 운영진만</span>
        )}
      </div>

      {!current ? (
        <div className="card muted">기록된 {cfg.roundName}가 없어요.{admin ? ` [+ 새 ${cfg.roundName}]로 시작하세요.` : ''}</div>
      ) : (
        <div className="card">
          <div className="row between">
            <div>
              <strong style={{ fontSize: '1.1rem' }}>{current.label}</strong>
              {current.date && <span className="muted" style={{ marginLeft: 8 }}>기록 시작 {current.date}</span>}
            </div>
            {admin && (
              <div className="row">
                <button className="small" onClick={() => renameRound(current)}>이름변경</button>
                <button className="small danger" onClick={() => deleteRound(current)}>{cfg.roundName}삭제</button>
              </div>
            )}
          </div>

          {/* 요일 탭 (공성전) */}
          {cfg.byDay && (
            <div className="row" style={{ marginTop: 12, gap: 6 }}>
              {WEEKDAYS.map((d) => {
                const cnt = (current.days?.[d] ?? []).filter((e) => typeof e.value === 'number').length
                return (
                  <button key={d} className={`small ${day === d ? 'primary' : ''}`} onClick={() => setDay(d)}>
                    {d}{cnt ? ` (${cnt})` : ''}
                  </button>
                )
              })}
            </div>
          )}

          <EntryTable
            key={(current.id) + (cfg.byDay ? day : '')}
            roster={roster}
            stored={stored}
            metric={cfg.metric}
            admin={admin}
            showJoined={cfg.showJoined}
            heading={cfg.byDay ? `${day}요일 기록` : undefined}
            prevValues={prevValues}
            deltaLabel={cfg.deltaLabel}
            onSet={setEntry}
            onAddName={addName}
            onRemoveName={removeName}
          />
        </div>
      )}
    </div>
  )
}

/** 전 주차(회차) 대비 상승/하락 % */
function Delta({ prev, cur }: { prev?: number; cur?: number }) {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return <span className="muted">—</span>
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(pct) < 0.05) return <span className="delta">0%</span>
  const up = pct > 0
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

function EntryTable({
  roster,
  stored,
  metric,
  admin,
  showJoined,
  heading,
  prevValues,
  deltaLabel,
  onSet,
  onAddName,
  onRemoveName,
}: {
  roster: string[]
  stored: StatEntry[]
  metric: string
  admin: boolean
  showJoined: boolean
  heading?: string
  prevValues: Map<string, number>
  deltaLabel: string
  onSet: (name: string, patch: Partial<StatEntry>) => void
  onAddName: (name: string) => void
  onRemoveName: (name: string) => void
}) {
  const [newName, setNewName] = useState('')

  const rosterSet = new Set(roster)
  const storedMap = new Map(stored.map((e) => [e.name, e]))
  // 표시 행 = [길드원] 명단 전원 + 명단에 없지만 기록된 이름(게스트/전 멤버)
  const extra = stored.map((e) => e.name).filter((n) => !rosterSet.has(n))
  const rows: StatEntry[] = [...roster, ...extra].map((n) => storedMap.get(n) ?? { name: n })

  const ranked = rows.map((e) => e).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  const scored = rows.filter((e) => typeof e.value === 'number')
  const total = scored.reduce((s, e) => s + (e.value as number), 0)
  const joinedCount = rows.filter((e) => e.joined).length
  const top = scored.length ? ranked[0] : undefined
  const cols = 5 + (showJoined ? 1 : 0) + (admin ? 1 : 0)

  return (
    <div style={{ marginTop: 14 }}>
      {heading && <div className="cc-sec" style={{ marginBottom: 8 }}>{heading}</div>}

      <div className="stat-tiles" style={{ margin: '0 0 6px' }}>
        <div className="stat-tile"><div className="num">{scored.length}<span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>/{rows.length}</span></div><div className="label">{metric} 입력</div></div>
        {showJoined && <div className="stat-tile"><div className="num">{joinedCount}</div><div className="label">참여 인원</div></div>}
        <div className="stat-tile"><div className="num">{fmt(total)}</div><div className="label">{metric} 합계</div></div>
        <div className="stat-tile"><div className="num" style={{ fontSize: '1.15rem' }}>{top ? top.name : '-'}</div><div className="label">{metric} 1위 ({fmt(top?.value)})</div></div>
      </div>

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>순위</th>
              <th>길드원</th>
              <th style={{ textAlign: 'right' }}>{metric}</th>
              <th style={{ width: 100 }}>{deltaLabel}</th>
              {showJoined && <th style={{ width: 60 }}>참여</th>}
              <th>메모</th>
              {admin && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols} className="muted">[길드원] 메뉴에 등록된 사람이 없어요. 먼저 길드원을 등록해주세요.</td></tr>
            )}
            {ranked.map((e, rank) => (
              <tr key={e.name}>
                <td><b>{typeof e.value === 'number' ? rank + 1 : '-'}</b></td>
                <td><b>{e.name}</b>{!rosterSet.has(e.name) && <span className="muted" style={{ marginLeft: 4, fontSize: '0.75rem' }}>(외부)</span>}</td>
                <td style={{ textAlign: 'right' }}>{admin ? (
                  <input type="number" value={e.value ?? ''} placeholder="0"
                    onChange={(ev) => onSet(e.name, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                    style={{ width: 110, textAlign: 'right' }} />
                ) : (fmt(e.value))}</td>
                <td><Delta prev={prevValues.get(e.name)} cur={e.value} /></td>
                {showJoined && <td>{admin ? (
                  <input type="checkbox" checked={!!e.joined} onChange={(ev) => onSet(e.name, { joined: ev.target.checked })} />
                ) : (<span className={`badge ${e.joined ? 'win' : 'lose'}`}>{e.joined ? 'O' : 'X'}</span>)}</td>}
                <td>{admin ? (
                  <input value={e.memo ?? ''} placeholder="메모" onChange={(ev) => onSet(e.name, { memo: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                ) : (<span className="muted">{e.memo || ''}</span>)}</td>
                {admin && <td>{!rosterSet.has(e.name) && <button className="small danger" onClick={() => onRemoveName(e.name)}>✕</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin && (
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="외부(비길드원) 이름 추가" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onAddName(newName); setNewName('') } }} />
          <button className="small" onClick={() => { onAddName(newName); setNewName('') }}>+ 추가</button>
          <span className="muted" style={{ fontSize: '0.8rem' }}>길드원은 [길드원] 메뉴 등록만으로 자동 표시돼요</span>
        </div>
      )}
    </div>
  )
}
