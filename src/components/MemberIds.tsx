import { useEffect, useState } from 'react'
import { PasswordInput } from './PasswordInput'
import { getAdminPw, issueId, listIds, revokeIds, setAdminPw, setGate, type IdRow } from '../session'

/**
 * 길드원 아이디 발급 — [길드원] 페이지의 운영진 도구.
 *
 * 순서가 중요하다. 로그인 검사를 먼저 켜면 아이디 없는 길드원 전원이 잠긴다.
 *   1) 길드원마다 아이디를 발급하고 임시 비번을 전달
 *   2) 다 돌린 뒤에 검사를 켠다
 * 그래서 검사 스위치는 맨 아래에 두고, 안 만든 사람이 남아 있으면 경고를 띄운다.
 *
 * 임시 비번은 발급 순간에만 보여준다. 워커는 해시만 갖고 있어서 다시 못 꺼낸다.
 */
export function MemberIds() {
  const [pw, setPw] = useState(getAdminPw())
  const [data, setData] = useState<{ on: boolean; members: IdRow[]; orphans: string[] } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ name: string; pw: string } | null>(null)

  async function load(nextPw?: string) {
    if (nextPw !== undefined) setAdminPw(nextPw)
    setErr(''); setBusy(true)
    try { setData(await listIds()) } catch (e) {
      setData(null)
      setErr(e instanceof Error ? e.message : '목록을 못 받았어요.')
    } finally { setBusy(false) }
  }
  useEffect(() => { if (getAdminPw()) void load() }, [])

  async function act(fn: () => Promise<unknown>) {
    setErr(''); setBusy(true)
    try { await fn(); await load() } catch (e) {
      setErr(e instanceof Error ? e.message : '요청이 실패했어요.')
      setBusy(false)
    }
  }

  const noId = data ? data.members.filter((m) => !m.excluded && !m.hasId) : []

  return (
    <div className="card id-panel">
      <strong>길드원 아이디</strong>
      <p className="muted">
        길드원마다 아이디를 만들어 두면, <b>길드를 나간 사람은 사이트를 못 엽니다.</b>
        명단에서 빼거나 외부 처리하는 순간 바로 막혀요.
      </p>

      <div className="row" style={{ marginTop: 10 }}>
        <label className="def-label">운영진 비번</label>
        <span style={{ flex: 1, minWidth: 140, maxWidth: 240 }}>
          <PasswordInput value={pw} onChange={setPw} onEnter={() => void load(pw)}
            placeholder="워커에 넣어둔 비밀번호" />
        </span>
        <button className="small primary" disabled={busy || !pw} onClick={() => void load(pw)}>확인</button>
      </div>

      {err && <p className="login-err">{err}</p>}

      {data && (
        <>
          <div className={`id-state ${data.on ? 'on' : ''}`} style={{ marginTop: 12 }}>
            {data.on
              ? <><b>로그인 검사 켜짐</b> — 아이디가 있어야 사이트가 열립니다.</>
              : <><b>로그인 검사 꺼짐</b> — 지금은 누구나 볼 수 있어요. 아이디를 다 나눠준 뒤 켜세요.</>}
            <span className="spacer" />
            <button
              className={`small ${data.on ? 'danger' : 'primary'}`}
              disabled={busy || (!data.on && noId.length > 0)}
              onClick={() => {
                if (data.on) { if (!confirm('검사를 끄면 다시 누구나 볼 수 있게 됩니다. 끌까요?')) return }
                else if (!confirm(`지금 켜면 아이디 없는 사람은 사이트를 못 엽니다.\n아이디 ${data.members.filter((m) => m.hasId).length}명 발급됨. 켤까요?`)) return
                void act(() => setGate(!data.on))
              }}
            >{data.on ? '검사 끄기' : '검사 켜기'}</button>
          </div>

          {!data.on && noId.length > 0 && (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
              아직 아이디가 없는 길드원 {noId.length}명이 있어요 — {noId.map((m) => m.name).join(' · ')}.
              전원 발급해야 검사를 켤 수 있습니다.
            </p>
          )}

          {issued && (
            <div className="id-pw">
              <b>{issued.name}</b> 님의 임시 비밀번호 <code>{issued.pw}</code>
              <br />지금 복사해서 본인에게 전해주세요. <b>이 창을 닫으면 다시 못 봅니다</b> —
              잃어버리면 새로 발급하면 됩니다. 본인이 처음 로그인할 때 새 비밀번호를 정하게 돼 있어요.
              <br />
              <button className="small" style={{ marginTop: 8 }}
                onClick={() => { void navigator.clipboard?.writeText(issued.pw); setIssued(null) }}>
                복사하고 닫기
              </button>
            </div>
          )}

          <div className="id-rows">
            {data.members.map((m) => (
              <div key={m.name} className={`id-row ${m.excluded ? 'gone' : ''}`}>
                <span className="id-name">
                  {m.name}
                  {m.excluded && <span className="badge excluded" style={{ marginLeft: 6 }}>외부</span>}
                </span>
                <span className={`id-mark ${m.tmp ? 'tmp' : ''}`}>
                  {!m.hasId ? '아이디 없음' : m.tmp ? '임시 비번 (아직 안 바꿈)' : '사용 중'}
                </span>
                <span className="row" style={{ gap: 5 }}>
                  <button className="small" disabled={busy}
                    onClick={() => void act(async () => { setIssued({ name: m.name, pw: await issueId(m.name) }) })}>
                    {m.hasId ? '비번 재발급' : '아이디 만들기'}
                  </button>
                  {m.hasId && (
                    <button className="small danger" disabled={busy}
                      onClick={() => { if (confirm(`'${m.name}' 아이디를 없앨까요? 다시 못 들어옵니다.`)) void act(() => revokeIds([m.name])) }}>
                      ✕
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>

          {data.orphans.length > 0 && (
            <p className="muted" style={{ marginTop: 10, fontSize: '0.85rem' }}>
              명단에 없는데 아이디만 남은 계정 {data.orphans.length}개 — {data.orphans.join(' · ')}.
              이미 못 들어오지만 정리하려면{' '}
              <button className="small danger" disabled={busy}
                onClick={() => { if (confirm('남은 아이디를 모두 지울까요?')) void act(() => revokeIds(data.orphans)) }}>
                한 번에 지우기
              </button>
            </p>
          )}
        </>
      )}
    </div>
  )
}
