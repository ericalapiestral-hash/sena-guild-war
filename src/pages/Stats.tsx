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
    desc: '주차를 고르고 요일(월~일)마다 [편집]을 눌러 점수를 입력하고 [저장]하면 잠겨요. 각 요일 점수를 지난주 같은 요일과 비교해 등락(%)이 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
    metric: '점수',
    field: 'siegeRounds',
    byDay: true,
    roundName: '주차',
    showJoined: false,
    deltaLabel: '전주 대비',
  },
  destroyer: {
    title: '파괴신 통계',
    desc: '회차별로 [편집]을 눌러 길드원 딜량을 입력하고 [저장]하면 잠겨요. 각 회차를 직전 회차와 비교해 등락(%)이 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
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
  const roster = data.members.map((m) => m.name)

  const [selId, setSelId] = useState<string | null>(null)
  const [day, setDay] = useState<string>(todayWeekday())
  const current = rounds.find((r) => r.id === selId) ?? rounds[rounds.length - 1] ?? null

  const stored: StatEntry[] = current ? (cfg.byDay ? current.days?.[day] ?? [] : current.entries) : []

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

  /** [저장] — 현재 회차/요일의 기록을 통째로 교체 (편집 모드 결과 한 번에 커밋) */
  const saveAll = (list: StatEntry[]) => {
    if (!current) return
    patchRound(current.id, (r) => {
      if (cfg.byDay) {
        if (!r.days) r.days = {}
        r.days[day] = list
      } else {
        r.entries = list
      }
    })
  }

  return (
    <div>
      <h1>{cfg.title}</h1>
      <p className="page-desc">{cfg.desc}</p>

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
            onSaveAll={saveAll}
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
  onSaveAll,
}: {
  roster: string[]
  stored: StatEntry[]
  metric: string
  admin: boolean
  showJoined: boolean
  heading?: string
  prevValues: Map<string, number>
  deltaLabel: string
  onSaveAll: (list: StatEntry[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, Partial<StatEntry>>>({})
  const [localExtra, setLocalExtra] = useState<string[]>([])
  const [newName, setNewName] = useState('')

  const rosterSet = new Set(roster)
  const storedMap = new Map(stored.map((e) => [e.name, e]))
  const storedExtra = stored.map((e) => e.name).filter((n) => !rosterSet.has(n))
  const baseNames = [...roster, ...storedExtra, ...localExtra.filter((n) => !rosterSet.has(n) && !storedExtra.includes(n))]

  const valOf = (name: string): Partial<StatEntry> => (editing ? draft[name] ?? {} : storedMap.get(name) ?? {})
  const rows: StatEntry[] = baseNames.map((name) => ({ name, ...valOf(name) }))

  const scored = rows.filter((e) => typeof e.value === 'number')
  const total = scored.reduce((s, e) => s + (e.value as number), 0)
  const joinedCount = rows.filter((e) => e.joined).length
  const ranked = [...rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  const top = scored.length ? ranked[0] : undefined
  const displayRows = editing ? rows : ranked // 편집 중엔 명단 순서 고정, 잠금 시 점수순 정렬
  const cols = 5 + (showJoined ? 1 : 0) + (editing ? 1 : 0)

  function startEdit() {
    const d: Record<string, Partial<StatEntry>> = {}
    for (const name of baseNames) { const e = storedMap.get(name); if (e) d[name] = { value: e.value, joined: e.joined, memo: e.memo } }
    setDraft(d)
    setLocalExtra([])
    setEditing(true)
  }
  const setField = (name: string, patch: Partial<StatEntry>) => setDraft((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  function save() {
    const list = baseNames
      .map((name) => ({ name, ...(draft[name] ?? {}) } as StatEntry))
      .filter((e) => typeof e.value === 'number' || e.joined || (e.memo ?? '').trim())
    onSaveAll(list)
    setEditing(false)
    setLocalExtra([])
  }
  function cancel() {
    setEditing(false)
    setLocalExtra([])
    setDraft({})
  }
  function addExternal() {
    const n = newName.trim()
    setNewName('')
    if (!n || baseNames.includes(n)) return
    setLocalExtra((prev) => [...prev, n])
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        {heading ? <div className="cc-sec">{heading}</div> : <span />}
        {admin && !editing && <button className="primary small" onClick={startEdit}>✏️ {metric} 입력·수정</button>}
        {admin && editing && <span className="delta up" style={{ fontSize: '0.85rem' }}>✏️ 편집 중 — 아래 [저장]을 눌러야 반영돼요</span>}
      </div>

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
              <th style={{ width: 44 }}>{editing ? '#' : '순위'}</th>
              <th>길드원</th>
              <th style={{ textAlign: 'right' }}>{metric}</th>
              <th style={{ width: 100 }}>{deltaLabel}</th>
              {showJoined && <th style={{ width: 60 }}>참여</th>}
              <th>메모</th>
              {editing && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols} className="muted">[길드원] 메뉴에 등록된 사람이 없어요. 먼저 길드원을 등록해주세요.</td></tr>
            )}
            {displayRows.map((e, i) => (
              <tr key={e.name}>
                <td><b>{editing ? i + 1 : typeof e.value === 'number' ? i + 1 : '-'}</b></td>
                <td><b>{e.name}</b>{!rosterSet.has(e.name) && <span className="muted" style={{ marginLeft: 4, fontSize: '0.75rem' }}>(외부)</span>}</td>
                <td style={{ textAlign: 'right' }}>{editing ? (
                  <input type="number" value={e.value ?? ''} placeholder="0" className="num-tab"
                    onChange={(ev) => setField(e.name, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                    style={{ width: 120, textAlign: 'right' }} />
                ) : (<b className="num-tab">{fmt(e.value)}</b>)}</td>
                <td><Delta prev={prevValues.get(e.name)} cur={e.value} /></td>
                {showJoined && <td>{editing ? (
                  <input type="checkbox" checked={!!e.joined} onChange={(ev) => setField(e.name, { joined: ev.target.checked })} />
                ) : (<span className={`badge ${e.joined ? 'win' : 'lose'}`}>{e.joined ? 'O' : 'X'}</span>)}</td>}
                <td>{editing ? (
                  <input value={e.memo ?? ''} placeholder="메모" onChange={(ev) => setField(e.name, { memo: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                ) : (<span className="muted">{e.memo || ''}</span>)}</td>
                {editing && <td>{!rosterSet.has(e.name) && <button className="small danger" onClick={() => setLocalExtra((prev) => prev.filter((x) => x !== e.name))}>✕</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 하단 저장/취소 (편집 모드) */}
      {admin && editing && (
        <>
          <div className="row" style={{ marginTop: 12 }}>
            <input placeholder="외부(비길드원) 이름 추가" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addExternal() }} />
            <button className="small" onClick={addExternal}>+ 추가</button>
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={cancel}>취소</button>
            <button className="primary" onClick={save}>💾 저장</button>
          </div>
        </>
      )}
    </div>
  )
}
