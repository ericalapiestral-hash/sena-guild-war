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
          운영진 전용 페이지(AI 검색 · 길드원 · 데이터)는 비밀번호가 필요해요.
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
