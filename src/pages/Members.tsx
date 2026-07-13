import { useState } from 'react'
import type { Member } from '../types'
import { newId, update, useUserData } from '../store'

export function MembersPage() {
  const { members } = useUserData()
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  function addMember() {
    const name = newName.trim()
    if (!name) return
    update((d) => { d.members.push({ id: newId('member'), name, records: [] }) })
    setNewName('')
  }

  return (
    <div>
      <h1>길드원 관리</h1>
      <p className="page-desc">길드원별 담당·메모와 길드전 승패 기록을 관리합니다.</p>

      <div className="card">
        <div className="row">
          <input placeholder="길드원 이름" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMember()} />
          <button className="primary" disabled={!newName.trim()} onClick={addMember}>+ 추가</button>
          <span className="spacer" />
          <span className="muted">총 {members.length}명</span>
        </div>
      </div>

      {members.map((m) => (
        <MemberCard key={m.id} member={m}
          expanded={expanded === m.id}
          onToggle={() => setExpanded(expanded === m.id ? null : m.id)} />
      ))}
      {members.length === 0 && (
        <div className="card muted">아직 길드원이 없어요. 위에서 이름을 입력해 추가하세요.</div>
      )}
    </div>
  )
}

function MemberCard({ member, expanded, onToggle }: { member: Member; expanded: boolean; onToggle: () => void }) {
  const wins = member.records.filter((r) => r.result === '승').length
  const losses = member.records.length - wins
  const [memo, setMemo] = useState(member.note ?? '')
  const [oppo, setOppo] = useState('')
  const [recMemo, setRecMemo] = useState('')

  function addRecord(result: '승' | '패') {
    update((d) => {
      const target = d.members.find((x) => x.id === member.id)
      if (!target) return
      target.records.unshift({
        id: newId('rec'),
        date: new Date().toISOString().slice(0, 10),
        opponent: oppo.trim() || undefined,
        result,
        memo: recMemo.trim() || undefined,
      })
    })
    setOppo(''); setRecMemo('')
  }

  return (
    <div className="card">
      <div className="row between" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div className="row">
          <strong>{member.name}</strong>
          {member.note && <span className="muted">— {member.note}</span>}
        </div>
        <div className="row">
          <span className="badge win">{wins}승</span>
          <span className="badge lose">{losses}패</span>
          <span className="muted">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <div className="row">
            <input placeholder="담당/메모 (예: 1번 방덱 담당, 주력: 연희 카르마 린)" value={memo}
              onChange={(e) => setMemo(e.target.value)} style={{ flex: 1 }} />
            <button className="small" onClick={() => {
              update((d) => {
                const t = d.members.find((x) => x.id === member.id)
                if (t) t.note = memo.trim() || undefined
              })
            }}>메모 저장</button>
            <button className="small danger" onClick={() => {
              if (confirm(`'${member.name}' 길드원을 삭제할까요? 기록도 함께 삭제됩니다.`)) {
                update((d) => { d.members = d.members.filter((x) => x.id !== member.id) })
              }
            }}>길드원 삭제</button>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <input placeholder="상대 (선택)" value={oppo} onChange={(e) => setOppo(e.target.value)} style={{ width: 140 }} />
            <input placeholder="전투 메모 (선택)" value={recMemo} onChange={(e) => setRecMemo(e.target.value)} style={{ flex: 1 }} />
            <button className="small" style={{ color: 'var(--ok)' }} onClick={() => addRecord('승')}>+ 승</button>
            <button className="small" style={{ color: 'var(--danger)' }} onClick={() => addRecord('패')}>+ 패</button>
          </div>

          {member.records.length > 0 && (
            <div className="table-wrap">
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>날짜</th><th>결과</th><th>상대</th><th>메모</th><th /></tr></thead>
                <tbody>
                  {member.records.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td><span className={`badge ${r.result === '승' ? 'win' : 'lose'}`}>{r.result}</span></td>
                      <td>{r.opponent ?? '—'}</td>
                      <td className="muted">{r.memo ?? ''}</td>
                      <td>
                        <button className="small danger" onClick={() => {
                          update((d) => {
                            const t = d.members.find((x) => x.id === member.id)
                            if (t) t.records = t.records.filter((x) => x.id !== r.id)
                          })
                        }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
