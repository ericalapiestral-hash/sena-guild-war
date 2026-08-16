import { useState } from 'react'
import type { Member, MemberRole } from '../types'
import { newId, todayLocal, update, useUserData } from '../store'

const ROLES: MemberRole[] = ['길드마스터', '부길드마스터', '정예멤버', '멤버']
const roleRank = (r?: MemberRole) => {
  const i = ROLES.indexOf(r ?? '멤버')
  return i < 0 ? ROLES.length : i
}

type Filter = '전체' | '활동' | '외부'

export function MembersPage() {
  const { members } = useUserData()
  const [newName, setNewName] = useState('')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('전체')
  /** 일괄 처리용 선택 (길드원 id) — 자리 때문에 여러 계정을 한 번에 넣고 빼는 일이 잦다 */
  const [sel, setSel] = useState<Set<string>>(new Set())
  // 이미 쓰고 있는 등급 목록 (입력 자동완성용)
  const tiers = [...new Set(members.map((m) => m.tier).filter((t): t is string => !!t))].sort()

  const activeCount = members.filter((m) => !m.excluded).length
  const excludedCount = members.length - activeCount

  // 활동 중인 사람 먼저, 그 안에서 역할 순 (마스터 → 부마스터 → 정예 → 멤버).
  // 외부 처리한 계정은 명단 아래로 몰아 둔다 — 평소엔 눈에 안 걸리게.
  const sorted = [...members].sort(
    (a, b) => Number(!!a.excluded) - Number(!!b.excluded) || roleRank(a.role) - roleRank(b.role),
  )
  const query = q.trim()
  const shown = sorted.filter((m) => {
    if (filter === '활동' && m.excluded) return false
    if (filter === '외부' && !m.excluded) return false
    if (!query) return true
    return m.name.includes(query) || (m.owner ?? '').includes(query) || (m.note ?? '').includes(query) || (m.tier ?? '').includes(query)
  })
  const roleCount = (r: MemberRole) => members.filter((m) => !m.excluded && (m.role ?? '멤버') === r).length

  const toggleSel = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** 선택한 계정을 한 번에 외부 처리하거나 길드로 되돌린다 */
  function setExcluded(ids: Set<string>, value: boolean) {
    if (!ids.size) return
    update((d) => {
      for (const m of d.members) {
        if (ids.has(m.id)) m.excluded = value || undefined
      }
    })
    setSel(new Set())
  }

  const selectedNames = members.filter((m) => sel.has(m.id)).map((m) => m.name)
  const allShownSelected = shown.length > 0 && shown.every((m) => sel.has(m.id))

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
      <p className="page-desc">
        길드원별 역할·담당·메모와 길드전 승패 기록을 관리합니다. 여러 명은 쉼표로 한 번에 추가하고, 삭제는 각 줄의 ✕를 누르세요.
        <br />
        자리 때문에 잠시 나가 있는 계정은 <b>삭제하지 말고 [외부로 제외]</b>를 쓰세요 — 기록은 남고 통계 명단에서만 빠집니다.
      </p>

      <div className="card">
        <div className="row">
          <input placeholder="길드원 이름 (쉼표로 여러 명 한 번에)" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMember()} style={{ flex: 1, minWidth: 180 }} />
          <button className="primary" disabled={!newName.trim()} onClick={addMember}>+ 추가</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="🔍 이름·주인·메모·등급 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <span className="muted">
            {query ? `${shown.length}명 표시 / ` : ''}활동 {activeCount}명
            {excludedCount > 0 && <> · 외부 {excludedCount}명</>}
            {ROLES.slice(0, 3).map((r) => roleCount(r) > 0 && <span key={r}> · {r} {roleCount(r)}</span>)}
          </span>
        </div>
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          {(['전체', '활동', '외부'] as Filter[]).map((f) => (
            <button key={f} className={`small ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>
              {f}
              {f === '활동' ? ` ${activeCount}` : f === '외부' ? ` ${excludedCount}` : ` ${members.length}`}
            </button>
          ))}
          <span className="spacer" />
          {shown.length > 0 && (
            <button
              className="small"
              onClick={() => setSel(allShownSelected ? new Set() : new Set(shown.map((m) => m.id)))}
            >
              {allShownSelected ? '선택 해제' : `${shown.length}명 전체 선택`}
            </button>
          )}
        </div>
      </div>

      {/* 선택한 계정 일괄 처리 — 자리 정리할 때 한 명씩 누르지 않게 */}
      {sel.size > 0 && (
        <div className="card member-bulk">
          <div className="row between">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <strong>{sel.size}명 선택</strong>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {selectedNames.slice(0, 6).join(', ')}
                {selectedNames.length > 6 && ` 외 ${selectedNames.length - 6}명`}
              </span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="small" onClick={() => setExcluded(sel, true)}>외부로 제외</button>
              <button className="small" onClick={() => setExcluded(sel, false)}>길드로 복귀</button>
              <button className="small ghost" onClick={() => setSel(new Set())}>해제</button>
            </div>
          </div>
        </div>
      )}

      {/* 등급 입력 자동완성 (이미 쓰고 있는 등급) */}
      <datalist id="member-tiers">{tiers.map((t) => <option key={t} value={t} />)}</datalist>

      {shown.map((m) => (
        <MemberCard key={m.id} member={m}
          expanded={expanded === m.id}
          selected={sel.has(m.id)}
          onSelect={() => toggleSel(m.id)}
          onToggle={() => setExpanded(expanded === m.id ? null : m.id)} />
      ))}
      {members.length === 0 && (
        <div className="card muted">아직 길드원이 없어요. 위에서 이름을 입력해 추가하세요.</div>
      )}
      {members.length > 0 && shown.length === 0 && (
        <div className="card muted">
          {query ? `'${query}' 검색 결과가 없어요.` : filter === '외부' ? '외부로 제외해 둔 계정이 없어요.' : '표시할 길드원이 없어요.'}
        </div>
      )}
    </div>
  )
}

function MemberCard({
  member,
  expanded,
  selected,
  onSelect,
  onToggle,
}: {
  member: Member
  expanded: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const wins = member.records.filter((r) => r.result === '승').length
  const losses = member.records.length - wins
  const [memo, setMemo] = useState(member.note ?? '')
  const [owner, setOwner] = useState(member.owner ?? '')
  const [nick, setNick] = useState(member.name)
  const [tier, setTier] = useState(member.tier ?? '')
  const [oppo, setOppo] = useState('')
  const [recMemo, setRecMemo] = useState('')

  /** 닉네임 변경 — 공성전·파괴신 기록과 부계정 주인 표기까지 함께 바꿔 과거 기록이 끊기지 않게 */
  function renameMember(next: string) {
    const to = next.trim()
    const from = member.name
    if (!to || to === from) { setNick(from); return }
    update((d) => {
      if (d.members.some((m) => m.id !== member.id && m.name === to)) {
        alert(`'${to}' 이름을 가진 길드원이 이미 있어요.`)
        return
      }
      const target = d.members.find((m) => m.id === member.id)
      if (!target) return
      target.name = to
      for (const m of d.members) if (m.owner === from) m.owner = to
      const renameEntries = (list?: { name: string }[]) => list?.forEach((e) => { if (e.name === from) e.name = to })
      for (const r of [...d.siegeRounds, ...d.destroyerRounds]) {
        renameEntries(r.entries)
        if (r.days) for (const day of Object.keys(r.days)) renameEntries(r.days[day])
      }
    })
  }

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
    <div className={`card member-card${member.excluded ? ' is-excluded' : ''}${selected ? ' is-selected' : ''}`}>
      <div className="row between" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div className="row">
          {/* 라벨로 감싸 체크박스 주변까지 눌리게 — 카드 펼침과 겹치지 않도록 클릭을 여기서 멈춘다 */}
          <label className="member-pick" onClick={(e) => e.stopPropagation()} title="일괄 처리용 선택">
            <input type="checkbox" checked={selected} onChange={onSelect} />
          </label>
          <strong>{member.name}</strong>
          {member.excluded && <span className="badge excluded">외부</span>}
          {member.role && member.role !== '멤버' && <span className={`badge role-${member.role}`}>{member.role}</span>}
          {member.isAlt && <span className="badge alt">부계정</span>}
          {member.tier && <span className="badge tier">{member.tier}</span>}
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
            <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>닉네임</label>
            <input value={nick} onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameMember((e.target as HTMLInputElement).value) }}
              onBlur={(e) => renameMember(e.target.value)}
              style={{ flex: 1, minWidth: 140 }} />
            <button className="small" onClick={() => renameMember(nick)}>이름 변경</button>
            <span className="muted" style={{ fontSize: '0.78rem' }}>바꾸면 공성전·파괴신 기록도 같이 따라가요</span>
          </div>
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
            <label className="row" style={{ gap: 6, fontSize: '0.85rem', cursor: 'pointer', marginLeft: 4 }}>
              <input type="checkbox" checked={!!member.excluded} onChange={(e) => {
                const v = e.target.checked
                update((d) => { const t = d.members.find((x) => x.id === member.id); if (t) t.excluded = v || undefined })
              }} />
              외부 제외
            </label>
          </div>
          {member.excluded && (
            <p className="member-excluded-note">
              지금 길드에 없는 계정으로 표시돼 있어요 — 공성전·파괴신 명단과 커트라인 집계에서 빠집니다.
              지난 회차에 남은 점수와 아래 승패 기록은 그대로예요.
            </p>
          )}
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>계정 주인</label>
            <input placeholder="계정 주인 이름 (선택 — 비우면 표시 안 됨)" value={owner}
              onChange={(e) => setOwner(e.target.value)}
              onBlur={(e) => { const v = e.target.value.trim(); update((d) => { const t = d.members.find((x) => x.id === member.id); if (t) t.owner = v || undefined }) }}
              style={{ flex: 1 }} />
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>등급</label>
            <input list="member-tiers" placeholder="파괴신 등급 (예: 파이 3초월 — 비우면 기본 커트라인 적용)" value={tier}
              onChange={(e) => setTier(e.target.value)}
              onBlur={(e) => { const v = e.target.value.trim(); update((d) => { const t = d.members.find((x) => x.id === member.id); if (t) t.tier = v || undefined }) }}
              style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: '0.78rem' }}>파괴신 커트라인이 등급별로 적용돼요</span>
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
