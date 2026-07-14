import { useState } from 'react'
import type { StatEntry, StatRound, UserData } from '../types'
import { getUserData, newId, update, useUserData } from '../store'
import { isAdmin } from '../auth'

type Kind = 'siege' | 'destroyer'

const CFG: Record<
  Kind,
  { title: string; desc: string; metric: string; field: 'siegeRounds' | 'destroyerRounds' }
> = {
  siege: {
    title: '공성전 통계',
    desc: '회차별로 길드원 점수·참여를 기록해요. 순위·합계·참여 인원이 자동 집계됩니다.',
    metric: '점수',
    field: 'siegeRounds',
  },
  destroyer: {
    title: '파괴신 통계',
    desc: '회차별로 길드원 딜량·참여를 기록해요. 딜량 랭킹이 자동 집계됩니다.',
    metric: '딜량',
    field: 'destroyerRounds',
  },
}

const fmt = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString() : '-')

export function StatsPage({ kind }: { kind: Kind }) {
  const data = useUserData()
  const cfg = CFG[kind]
  const rounds = data[cfg.field]
  const admin = isAdmin()

  const [selId, setSelId] = useState<string | null>(null)
  const current = rounds.find((r) => r.id === selId) ?? rounds[rounds.length - 1] ?? null

  // ---- 회차 조작 (운영진) ----
  function patchRounds(fn: (rs: StatRound[]) => void) {
    update((d: UserData) => { fn(d[cfg.field]) })
  }
  function patchRound(roundId: string, fn: (r: StatRound) => void) {
    patchRounds((rs) => { const r = rs.find((x) => x.id === roundId); if (r) fn(r) })
  }
  function addRound() {
    const label = prompt('회차 이름을 입력하세요. (예: 1회차 / 7월 2주 / 시즌 12)')?.trim()
    if (!label) return
    const id = newId(kind)
    patchRounds((rs) => rs.push({ id, label, date: new Date().toISOString().slice(0, 10), entries: [] }))
    setSelId(id)
  }
  function renameRound(r: StatRound) {
    const label = prompt('회차 이름 변경', r.label)?.trim()
    if (!label) return
    patchRound(r.id, (x) => { x.label = label })
  }
  function deleteRound(r: StatRound) {
    if (!confirm(`'${r.label}' 회차를 삭제할까요? (기록 전체가 사라져요)`)) return
    patchRounds((rs) => { const i = rs.findIndex((x) => x.id === r.id); if (i >= 0) rs.splice(i, 1) })
    setSelId(null)
  }

  // ---- 엔트리 조작 (운영진) ----
  function addEntry(roundId: string, name: string) {
    const n = name.trim()
    if (!n) return
    patchRound(roundId, (r) => { if (!r.entries.some((e) => e.name === n)) r.entries.push({ name: n, joined: true }) })
  }
  function addAllMembers(roundId: string) {
    const members = getUserData().members
    patchRound(roundId, (r) => {
      for (const m of members) if (!r.entries.some((e) => e.name === m.name)) r.entries.push({ name: m.name, joined: true })
    })
  }
  function patchEntry(roundId: string, i: number, patch: Partial<StatEntry>) {
    patchRound(roundId, (r) => { Object.assign(r.entries[i], patch) })
  }
  function removeEntry(roundId: string, i: number) {
    patchRound(roundId, (r) => { r.entries.splice(i, 1) })
  }

  return (
    <div>
      <h1>{cfg.title}</h1>
      <p className="page-desc">{cfg.desc}</p>

      {/* 회차 선택 */}
      <div className="row" style={{ marginBottom: 14 }}>
        {rounds.map((r) => (
          <button key={r.id} className={`small ${current?.id === r.id ? 'primary' : ''}`} onClick={() => setSelId(r.id)}>
            {r.label}
          </button>
        ))}
        {rounds.length === 0 && <span className="muted">아직 회차가 없어요.</span>}
        <span className="spacer" />
        {admin ? (
          <button className="primary" onClick={addRound}>+ 새 회차</button>
        ) : (
          <span className="muted">🔒 입력·수정은 운영진만</span>
        )}
      </div>

      {current ? (
        <RoundView
          key={current.id}
          round={current}
          metric={cfg.metric}
          admin={admin}
          onRename={() => renameRound(current)}
          onDelete={() => deleteRound(current)}
          onAddEntry={(name) => addEntry(current.id, name)}
          onAddAll={() => addAllMembers(current.id)}
          onPatch={(i, p) => patchEntry(current.id, i, p)}
          onRemove={(i) => removeEntry(current.id, i)}
        />
      ) : (
        <div className="card muted">
          기록된 회차가 없어요.{admin ? ' [+ 새 회차]로 시작하세요.' : ''}
        </div>
      )}
    </div>
  )
}

function RoundView({
  round,
  metric,
  admin,
  onRename,
  onDelete,
  onAddEntry,
  onAddAll,
  onPatch,
  onRemove,
}: {
  round: StatRound
  metric: string
  admin: boolean
  onRename: () => void
  onDelete: () => void
  onAddEntry: (name: string) => void
  onAddAll: () => void
  onPatch: (i: number, patch: Partial<StatEntry>) => void
  onRemove: (i: number) => void
}) {
  const [newName, setNewName] = useState('')

  // 값 내림차순 정렬 + 원본 인덱스 보존
  const ranked = round.entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.value ?? -Infinity) - (a.e.value ?? -Infinity))

  const values = round.entries.map((e) => e.value).filter((v): v is number => typeof v === 'number')
  const joinedCount = round.entries.filter((e) => e.joined).length
  const total = values.reduce((s, v) => s + v, 0)
  const avg = values.length ? Math.round(total / values.length) : 0
  const top = ranked[0]?.e

  return (
    <div className="card">
      <div className="row between">
        <div>
          <strong style={{ fontSize: '1.1rem' }}>{round.label}</strong>
          {round.date && <span className="muted" style={{ marginLeft: 8 }}>기록일 {round.date}</span>}
        </div>
        {admin && (
          <div className="row">
            <button className="small" onClick={onRename}>이름변경</button>
            <button className="small danger" onClick={onDelete}>회차삭제</button>
          </div>
        )}
      </div>

      {/* 요약 */}
      <div className="stat-tiles" style={{ margin: '14px 0 6px' }}>
        <div className="stat-tile"><div className="num">{round.entries.length}</div><div className="label">기록 인원</div></div>
        <div className="stat-tile"><div className="num">{joinedCount}</div><div className="label">참여 인원</div></div>
        <div className="stat-tile"><div className="num">{fmt(total)}</div><div className="label">{metric} 합계</div></div>
        <div className="stat-tile"><div className="num" style={{ fontSize: '1.15rem' }}>{top ? `${top.name}` : '-'}</div><div className="label">{metric} 1위 ({fmt(top?.value)})</div></div>
      </div>

      {/* 표 */}
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>순위</th>
              <th>길드원</th>
              <th style={{ textAlign: 'right' }}>{metric}</th>
              <th style={{ width: 60 }}>참여</th>
              <th>메모</th>
              {admin && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr><td colSpan={admin ? 6 : 5} className="muted">아직 기록이 없어요.{admin ? ' 아래에서 길드원을 추가하세요.' : ''}</td></tr>
            )}
            {ranked.map(({ e, i }, rank) => (
              <tr key={i}>
                <td><b>{typeof e.value === 'number' ? rank + 1 : '-'}</b></td>
                <td>
                  {admin ? (
                    <input value={e.name} onChange={(ev) => onPatch(i, { name: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                  ) : (
                    <b>{e.name}</b>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {admin ? (
                    <input type="number" value={e.value ?? ''} placeholder="0"
                      onChange={(ev) => onPatch(i, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                      style={{ width: 110, textAlign: 'right' }} />
                  ) : (
                    fmt(e.value)
                  )}
                </td>
                <td>
                  {admin ? (
                    <input type="checkbox" checked={!!e.joined} onChange={(ev) => onPatch(i, { joined: ev.target.checked })} />
                  ) : (
                    <span className={`badge ${e.joined ? 'win' : 'lose'}`}>{e.joined ? 'O' : 'X'}</span>
                  )}
                </td>
                <td>
                  {admin ? (
                    <input value={e.memo ?? ''} placeholder="메모" onChange={(ev) => onPatch(i, { memo: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                  ) : (
                    <span className="muted">{e.memo || ''}</span>
                  )}
                </td>
                {admin && <td><button className="small danger" onClick={() => onRemove(i)}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 길드원 추가 (운영진) */}
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
