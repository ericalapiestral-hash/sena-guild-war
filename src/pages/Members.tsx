import { useState } from 'react'
import type { Member, MemberRole } from '../types'
import { newId, todayLocal, update, useUserData } from '../store'

const ROLES: MemberRole[] = ['길드마스터', '부길드마스터', '정예멤버', '멤버']
const roleRank = (r?: MemberRole) => {
  const i = ROLES.indexOf(r ?? '멤버')
  return i < 0 ? ROLES.length : i
}

export function MembersPage() {
  const { members } = useUserData()
  const [newName, setNewName] = useState('')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // 역할 순으로 정렬 (마스터 → 부마스터 → 정예 → 멤버)
  const sorted = [...members].sort((a, b) => roleRank(a.role) - roleRank(b.role))
  const query = q.trim()
  const shown = query
    ? sorted.filter((m) => m.name.includes(query) || (m.owner ?? '').includes(query) || (m.note ?? '').includes(query))
    : sorted
  const roleCount = (r: MemberRole) => members.filter((m) => (m.role ?? '멤버') === r).length

  /** 쉼표·줄바꿈으로 여러 명 한 번에 추가 (이미 있는 이름은 건너뜀) */
  function addMember() {
    const names = newName.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    if (!names.length) return
    update((d) => {
      const existing = new Set(d.members.map((m) => m.name))
      for (const n of names) {
        if (existing.has(n)) continue
        d.members.push({ id: newId('member'), name: n, records: [] })
        existing.add(n)
      }
    })
    setNewName('')
  }

  return (
    <div>
      <h1>길드원 관리</h1>
      <p className="page-desc">길드원별 역할·담당·메모와 길드전 승패 기록을 관리합니다. 여러 명은 쉼표로 한 번에 추가하고, 삭제는 각 줄의 ✕를 누르세요.</p>

      <div className="card">
        <div className="row">
          <input placeholder="길드원 이름 (쉼표로 여러 명 한 번에)" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMember()} style={{ flex: 1, minWidth: 180 }} />
          <button className="primary" disabled={!newName.trim()} onClick={addMember}>+ 추가</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="🔍 이름·주인·메모 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <span className="muted">
            {query ? `${shown.length}명 표시 / ` : ''}총 {members.length}명
            {ROLES.slice(0, 3).map((r) => roleCount(r) > 0 && <span key={r}> · {r} {roleCount(r)}</span>)}
          </span>
        </div>
      </div>

      {shown.map((m) => (
        <MemberCard key={m.id} member={m}
          expanded={expanded === m.id}
          onToggle={() => setExpanded(expanded === m.id ? null : m.id)} />
      ))}
      {members.length === 0 && (
        <div className="card muted">아직 길드원이 없어요. 위에서 이름을 입력해 추가하세요.</div>
      )}
      {members.length > 0 && shown.length === 0 && (
        <div className="card muted">'{query}' 검색 결과가 없어요.</div>
      )}
    </div>
  )
}

function MemberCard({ member, expanded, onToggle }: { member: Member; expanded: boolean; onToggle: () => void }) {
  const wins = member.records.filter((r) => r.result === '승').length
  const losses = member.records.length - wins
  const [memo, setMemo] = useState(member.note ?? '')
  const [owner, setOwner] = useState(member.owner ?? '')
  const [oppo, setOppo] = useState('')
  const [recMemo, setRecMemo] = useState('')

  function addRecord(result: '승' | '패') {
    update((d) => {
      const target = d.members.find((x) => x.id === member.id)
      if (!target) return
      target.records.unshift({
        id: newId('rec'),
        date: todayLocal(),
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
          {member.role && member.role !== '멤버' && <span className={`badge role-${member.role}`}>{member.role}</span>}
          {member.isAlt && <span className="badge alt">부계정</span>}
          {member.owner && <span className="muted">· 주인 {member.owner}</span>}
          {member.note && <span className="muted">— {member.note}</span>}
        </div>
        <div className="row">
          <span className="badge win">{wins}승</span>
          <span className="badge lose">{losses}패</span>
          <span className="muted">{expanded ? '▲' : '▼'}</span>
          <button className="small danger" title="길드원 삭제" onClick={(e) => {
            e.stopPropagation()
            if (confirm(`'${member.name}' 길드원을 삭제할까요? 기록도 함께 삭제됩니다.`)) {
              update((d) => { d.members = d.members.filter((x) => x.id !== member.id) })
            }
          }}>✕</button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>역할</label>
            <select value={member.role ?? '멤버'} onChange={(e) => {
              const role = e.target.value as MemberRole
              update((d) => { const t = d.members.find((x) => x.id === member.id); if (t) t.role = role === '멤버' ? undefined : role })
            }}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <label className="row" style={{ gap: 6, fontSize: '0.85rem', cursor: 'pointer', marginLeft: 4 }}>
              <input type="checkbox" checked={!!member.isAlt} onChange={(e) => {
                const v = e.target.checked
                update((d) => { const t = d.members.find((x) => x.id === member.id); if (t) t.isAlt = v || undefined })
              }} />
              부계정
            </label>
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>계정 주인</label>
            <input placeholder="계정 주인 이름 (선택 — 비우면 표시 안 됨)" value={owner}
              onChange={(e) => setOwner(e.target.value)}
              onBlur={(e) => { const v = e.target.value.trim(); update((d) => { const t = d.members.find((x) => x.id === member.id); if (t) t.owner = v || undefined }) }}
              style={{ flex: 1 }} />
          </div>
          <div className="row">
            <input placeholder="담당/메모 (예: 1번 방덱 담당, 주력: 연희 카르마 린)" value={memo}
              onChange={(e) => setMemo(e.target.value)} style={{ flex: 1 }} />
            <button className="small" onClick={() => {
              update((d) => {
                const t = d.members.find((x) => x.id === member.id)
                if (t) t.note = memo.trim() || undefined
              })
            }}>메모 저장</button>
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
