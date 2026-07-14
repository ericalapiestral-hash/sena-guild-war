import { useState } from 'react'
import type { StatEntry, StatRound, UserData } from '../types'
import { getUserData, newId, update, useUserData } from '../store'
import { isAdmin } from '../auth'

type Kind = 'siege' | 'destroyer'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const todayWeekday = () => WEEKDAYS[(new Date().getDay() + 6) % 7]

const CFG: Record<
  Kind,
  { title: string; desc: string; metric: string; field: 'siegeRounds' | 'destroyerRounds'; byDay: boolean; roundName: string; showJoined: boolean }
> = {
  siege: {
    title: '공성전 통계',
    desc: '주차를 고르고 요일(월~일)마다 길드원 점수를 기록해요. 요일별 순위와 이번 주 점수 합산 랭킹이 자동 집계됩니다.',
    metric: '점수',
    field: 'siegeRounds',
    byDay: true,
    roundName: '주차',
    showJoined: false, // 점수제 — 참여 O/X·횟수 없이 점수만
  },
  destroyer: {
    title: '파괴신 통계',
    desc: '회차별로 길드원 딜량·참여를 기록해요. 딜량 랭킹이 자동 집계됩니다.',
    metric: '딜량',
    field: 'destroyerRounds',
    byDay: false,
    roundName: '회차',
    showJoined: true,
  },
}

const fmt = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString() : '-')

export function StatsPage({ kind }: { kind: Kind }) {
  const data = useUserData()
  const cfg = CFG[kind]
  const rounds = data[cfg.field]
  const admin = isAdmin()

  const [selId, setSelId] = useState<string | null>(null)
  const [day, setDay] = useState<string>(todayWeekday())
  const current = rounds.find((r) => r.id === selId) ?? rounds[rounds.length - 1] ?? null

  // 현재 화면의 기록 배열 (공성전=선택 요일, 파괴신=회차 자체)
  const entries: StatEntry[] = current ? (cfg.byDay ? current.days?.[day] ?? [] : current.entries) : []

  // 직전 주차(회차)와 비교 — 같은 요일 기준 상승/하락 %
  const currentIndex = current ? rounds.findIndex((r) => r.id === current.id) : -1
  const prevRound = currentIndex > 0 ? rounds[currentIndex - 1] : undefined
  const prevList: StatEntry[] = prevRound ? (cfg.byDay ? prevRound.days?.[day] ?? [] : prevRound.entries) : []
  const prevValues = new Map(
    prevList.filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]),
  )
  const deltaLabel = cfg.byDay ? '전주 대비' : '전 회차 대비'

  /** 한 주(모든 요일) 합산: 이름 → 총점 */
  const totalsOf = (r?: StatRound) => {
    const map = new Map<string, number>()
    if (!r) return map
    for (const d of WEEKDAYS)
      for (const e of r.days?.[d] ?? [])
        if (typeof e.value === 'number') map.set(e.name, (map.get(e.name) ?? 0) + e.value)
    return map
  }
  const prevWeekTotals = cfg.byDay ? totalsOf(prevRound) : new Map<string, number>()

  function patchRounds(fn: (rs: StatRound[]) => void) {
    update((d: UserData) => { fn(d[cfg.field]) })
  }
  function patchRound(roundId: string, fn: (r: StatRound) => void) {
    patchRounds((rs) => { const r = rs.find((x) => x.id === roundId); if (r) fn(r) })
  }
  /** 편집 대상 배열(공성전=days[요일], 파괴신=entries)을 확보 후 조작 */
  function editEntries(roundId: string, fn: (list: StatEntry[]) => void) {
    patchRound(roundId, (r) => {
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
    // [길드원 관리]에 등록된 로스터를 자동으로 채워넣음 (매번 손으로 추가할 필요 없게)
    const roster = getUserData().members
    const mk = (): StatEntry[] => roster.map((m) => (cfg.showJoined ? { name: m.name, joined: true } : { name: m.name }))
    patchRounds((rs) =>
      rs.push({
        id,
        label,
        date: new Date().toISOString().slice(0, 10),
        entries: cfg.byDay ? [] : mk(),
        ...(cfg.byDay ? { days: Object.fromEntries(WEEKDAYS.map((d) => [d, mk()])) } : {}),
      }),
    )
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

  const addEntry = (name: string) => {
    const n = name.trim()
    if (!current || !n) return
    editEntries(current.id, (l) => { if (!l.some((e) => e.name === n)) l.push({ name: n, joined: true }) })
  }
  const addAllMembers = () => {
    if (!current) return
    const members = getUserData().members
    editEntries(current.id, (l) => {
      for (const m of members) if (!l.some((e) => e.name === m.name)) l.push({ name: m.name, joined: true })
    })
  }
  const patchEntry = (i: number, patch: Partial<StatEntry>) => { if (current) editEntries(current.id, (l) => Object.assign(l[i], patch)) }
  const removeEntry = (i: number) => { if (current) editEntries(current.id, (l) => l.splice(i, 1)) }

  // 공성전: 이번 주 요일 합산 (요일 전체를 합쳐 길드원별 총점)
  const weekTotals = cfg.byDay && current
    ? [...totalsOf(current).entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
    : []

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
                const cnt = current.days?.[d]?.length ?? 0
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
            entries={entries}
            metric={cfg.metric}
            admin={admin}
            showJoined={cfg.showJoined}
            heading={cfg.byDay ? `${day}요일 기록` : undefined}
            prevValues={prevValues}
            deltaLabel={deltaLabel}
            onAddEntry={addEntry}
            onAddAll={addAllMembers}
            onPatch={patchEntry}
            onRemove={removeEntry}
          />

          {/* 이번 주 합산 (공성전) */}
          {cfg.byDay && weekTotals.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="cc-sec" style={{ marginBottom: 8 }}>이번 주 합산 ({cfg.metric} 요일 합계)</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th style={{ width: 44 }}>순위</th><th>길드원</th><th style={{ textAlign: 'right' }}>{cfg.metric} 합계</th><th style={{ width: 110 }}>전주 대비</th></tr></thead>
                  <tbody>
                    {weekTotals.map((w, i) => (
                      <tr key={w.name}>
                        <td><b>{i + 1}</b></td>
                        <td><b>{w.name}</b></td>
                        <td style={{ textAlign: 'right' }}>{fmt(w.total)}</td>
                        <td><Delta prev={prevWeekTotals.get(w.name)} cur={w.total} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 전 주차(회차) 대비 상승/하락 % */
function Delta({ prev, cur }: { prev?: number; cur?: number }) {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) {
    return <span className="muted">—</span>
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(pct) < 0.05) return <span className="delta">0%</span>
  const up = pct > 0
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

function EntryTable({
  entries,
  metric,
  admin,
  showJoined,
  heading,
  prevValues,
  deltaLabel,
  onAddEntry,
  onAddAll,
  onPatch,
  onRemove,
}: {
  entries: StatEntry[]
  metric: string
  admin: boolean
  showJoined: boolean
  heading?: string
  prevValues: Map<string, number>
  deltaLabel: string
  onAddEntry: (name: string) => void
  onAddAll: () => void
  onPatch: (i: number, patch: Partial<StatEntry>) => void
  onRemove: (i: number) => void
}) {
  const cols = 5 + (showJoined ? 1 : 0) + (admin ? 1 : 0)
  const [newName, setNewName] = useState('')

  const ranked = entries.map((e, i) => ({ e, i })).sort((a, b) => (b.e.value ?? -Infinity) - (a.e.value ?? -Infinity))
  const values = entries.map((e) => e.value).filter((v): v is number => typeof v === 'number')
  const joinedCount = entries.filter((e) => e.joined).length
  const total = values.reduce((s, v) => s + v, 0)
  const top = ranked[0]?.e

  return (
    <div style={{ marginTop: 14 }}>
      {heading && <div className="cc-sec" style={{ marginBottom: 8 }}>{heading}</div>}

      <div className="stat-tiles" style={{ margin: '0 0 6px' }}>
        <div className="stat-tile"><div className="num">{entries.length}</div><div className="label">기록 인원</div></div>
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
            {ranked.length === 0 && (
              <tr><td colSpan={cols} className="muted">아직 기록이 없어요.{admin ? ' 아래에서 길드원을 추가하세요.' : ''}</td></tr>
            )}
            {ranked.map(({ e, i }, rank) => (
              <tr key={i}>
                <td><b>{typeof e.value === 'number' ? rank + 1 : '-'}</b></td>
                <td>{admin ? (
                  <input value={e.name} onChange={(ev) => onPatch(i, { name: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                ) : (<b>{e.name}</b>)}</td>
                <td style={{ textAlign: 'right' }}>{admin ? (
                  <input type="number" value={e.value ?? ''} placeholder="0"
                    onChange={(ev) => onPatch(i, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                    style={{ width: 110, textAlign: 'right' }} />
                ) : (fmt(e.value))}</td>
                <td><Delta prev={prevValues.get(e.name)} cur={e.value} /></td>
                {showJoined && <td>{admin ? (
                  <input type="checkbox" checked={!!e.joined} onChange={(ev) => onPatch(i, { joined: ev.target.checked })} />
                ) : (<span className={`badge ${e.joined ? 'win' : 'lose'}`}>{e.joined ? 'O' : 'X'}</span>)}</td>}
                <td>{admin ? (
                  <input value={e.memo ?? ''} placeholder="메모" onChange={(ev) => onPatch(i, { memo: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                ) : (<span className="muted">{e.memo || ''}</span>)}</td>
                {admin && <td><button className="small danger" onClick={() => onRemove(i)}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin && (
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="길드원 이름 추가" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onAddEntry(newName); setNewName('') } }} />
          <button className="primary" onClick={() => { onAddEntry(newName); setNewName('') }}>+ 추가</button>
          <button className="small" onClick={onAddAll} title="[길드원 관리]에 등록된 사람들을 한 번에 불러와요">길드원 목록에서 불러오기</button>
        </div>
      )}
    </div>
  )
}
