import { useState } from 'react'
import { Markdown } from '../components/Markdown'

const CFG_KEY = 'sena-guild-war:search-config'

interface Cfg {
  workerUrl: string
  password: string
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  server_tool_use?: { web_search_requests?: number }
}

function loadCfg(): Cfg {
  try {
    return { workerUrl: '', password: '', ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }
  } catch {
    return { workerUrl: '', password: '' }
  }
}

export function SearchPage() {
  const [cfg, setCfg] = useState<Cfg>(loadCfg)
  const [showCfg, setShowCfg] = useState(!loadCfg().workerUrl)
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function saveCfg(next: Cfg) {
    setCfg(next)
    localStorage.setItem(CFG_KEY, JSON.stringify(next))
  }

  async function ask() {
    if (!cfg.workerUrl) {
      setShowCfg(true)
      setError('먼저 [서버 설정]에서 서버 주소와 비밀번호를 입력하세요.')
      return
    }
    if (!query.trim() || loading) return
    setLoading(true)
    setError('')
    setAnswer('')
    setUsage(null)
    try {
      const resp = await fetch(cfg.workerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), password: cfg.password }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error || `오류가 발생했어요 (${resp.status})`)
        return
      }
      setAnswer(data.answer || '')
      setUsage(data.usage || null)
    } catch {
      setError('서버에 연결하지 못했어요. 서버 주소가 맞는지 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>
        AI 공략검색 <span className="muted" style={{ fontSize: '0.65em', fontWeight: 400 }}>운영진 전용</span>
      </h1>
      <p className="page-desc">
        최신 길드전 메타를 웹에서 검색해 답해줍니다. 비밀번호를 아는 운영진만 사용할 수 있어요.
      </p>

      {showCfg && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)' }}>
          <strong>서버 설정</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            운영진에게 받은 서버 주소와 비밀번호를 입력하세요. 이 브라우저에만 저장됩니다.
          </p>
          <input
            placeholder="서버 주소 (https://....workers.dev)"
            value={cfg.workerUrl}
            onChange={(e) => saveCfg({ ...cfg, workerUrl: e.target.value.trim() })}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <input
            type="password"
            placeholder="운영진 비밀번호"
            value={cfg.password}
            onChange={(e) => saveCfg({ ...cfg, password: e.target.value })}
            style={{ width: '100%' }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={() => setShowCfg(false)} disabled={!cfg.workerUrl}>
              저장하고 닫기
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <textarea
          placeholder="예: 여포 칼헤론 클레미스 방덱 카운터 알려줘 / 요즘 길드전 1티어 방덱 뭐야?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask()
          }}
          style={{ width: '100%', minHeight: 80 }}
        />
        <div className="row between" style={{ marginTop: 8 }}>
          <button className="small" onClick={() => setShowCfg((s) => !s)}>
            서버 설정
          </button>
          <button className="primary" onClick={ask} disabled={loading || !query.trim()}>
            {loading ? '검색 중…' : '검색 (Ctrl+Enter)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="card muted">웹을 검색하고 있어요… 10~30초 정도 걸릴 수 있어요.</div>
      )}

      {answer && (
        <div className="card">
          <Markdown text={answer} />
          {usage && (
            <div
              className="muted"
              style={{ marginTop: 12, fontSize: '0.78rem', borderTop: '1px solid var(--border)', paddingTop: 8 }}
            >
              토큰: 입력 {usage.input_tokens ?? '?'} · 출력 {usage.output_tokens ?? '?'}
              {usage.server_tool_use?.web_search_requests != null &&
                ` · 웹검색 ${usage.server_tool_use.web_search_requests}회`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
