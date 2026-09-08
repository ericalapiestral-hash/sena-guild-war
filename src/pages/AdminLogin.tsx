import { useState } from 'react'
import { login } from '../auth'

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!pw || busy) return
    setBusy(true)
    setError('')
    const ok = await login(pw)
    setBusy(false)
    if (ok) onSuccess()
    else setError('비밀번호가 틀렸어요.')
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-lock">🔒</div>
        <h1 style={{ textAlign: 'center' }}>관리자 로그인</h1>
        <p className="page-desc" style={{ textAlign: 'center' }}>
          운영진 전용 페이지(길드원 · 데이터)예요.
          <br />
          <b>사이트 관리자는 길드원 로그인만으로 바로 들어옵니다</b> — 여기는 로그인 검사를
          아직 안 켰거나, 아무도 못 들어갈 때 쓰는 예비 문이에요.
          <br />
          비밀번호는 워커에 넣어 둔 <code>ADMIN_PW</code> 입니다.
        </p>
        <input
          type="password"
          placeholder="비밀번호"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ width: '100%' }}
        />
        {error && <div style={{ color: 'var(--danger)', marginTop: 8, fontSize: '0.9rem' }}>{error}</div>}
        <button className="primary" onClick={submit} disabled={busy || !pw} style={{ marginTop: 12, width: '100%' }}>
          {busy ? '확인 중…' : '들어가기'}
        </button>
      </div>
    </div>
  )
}
