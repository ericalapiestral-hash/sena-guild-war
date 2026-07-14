import { useEffect, useMemo, useRef, useState } from 'react'
import type { Hero, WarCastle, WarState } from '../types'
import { getAllHeroes } from '../store'
import { DeckLine } from '../components/HeroChip'
import { WORKER_URL } from '../data/config'

const POLL_MS = 12000
const TIERS: ('본성' | '내성' | '외성')[] = ['본성', '내성', '외성']

function resolveBase(): string {
  if (WORKER_URL) return WORKER_URL.replace(/\/+$/, '')
  try {
    const cfg = JSON.parse(localStorage.getItem('sena-guild-war:search-config') || '{}')
    return String(cfg.workerUrl || '').replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export function LiveWarPage() {
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const base = resolveBase()

  const [war, setWar] = useState<WarState | null>(null)
  const [error, setError] = useState('')
  const [lastFetch, setLastFetch] = useState<number | null>(null)
  const [, tick] = useState(0)
  const timer = useRef<number | null>(null)

  async function load() {
    if (!base) return
    try {
      const resp = await fetch(`${base}/war`, { cache: 'no-store' })
      const data = await resp.json()
      setWar(data && Object.keys(data).length ? data : null)
      setError('')
      setLastFetch(Date.now())
    } catch {
      setError('전황 서버에 연결하지 못했어요.')
    }
  }

  useEffect(() => {
    load()
    timer.current = window.setInterval(load, POLL_MS)
    const t2 = window.setInterval(() => tick((n) => n + 1), 1000) // "N초 전" 갱신용
    return () => {
      if (timer.current) clearInterval(timer.current)
      clearInterval(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  const ago = lastFetch ? Math.max(0, Math.round((Date.now() - lastFetch) / 1000)) : null

  return (
    <div>
      <div className="row between">
        <h1>실시간 전황</h1>
        <div className="row">
          <span className="live-dot" /> <span className="muted">자동 새로고침 {POLL_MS / 1000}초</span>
          <button className="small" onClick={load} disabled={!base}>새로고침</button>
        </div>
      </div>
      <p className="page-desc">
        진행 중인 길드전 상황을 실시간으로 보여줍니다. {ago != null && `(${ago}초 전 갱신)`}
      </p>

      {!base && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)' }}>
          아직 전황 서버가 연결되지 않았어요. 워커를 배포한 뒤 주소를 <code>src/data/config.ts</code>에 넣으면
          길드원 전원이 여기서 실시간 전황을 봅니다. (다음 길드전 때 화면 판독기까지 붙여 완성 예정)
        </div>
      )}

      {error && <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{error}</div>}

      {base && !war && !error && (
        <div className="card muted">
          진행 중인 길드전 정보가 없어요. 길드전이 시작되면 여기에 자동으로 채워집니다.
        </div>
      )}

      {war && (
        <>
          <div className="card">
            <div className="war-head">
              {war.phase && <span className="badge 커뮤니티">{war.phase}</span>}
              {war.round != null && <span className="muted">{war.round}라운드</span>}
              {war.timeLeft && <span className="muted">⏱ {war.timeLeft}</span>}
              {war.opponent && <span>vs <b>{war.opponent}</b></span>}
              {war.score && (
                <span className="spacer-right">
                  <b style={{ color: 'var(--info)' }}>{war.score.us ?? 0}</b>
                  <span className="muted"> : </span>
                  <b style={{ color: 'var(--danger)' }}>{war.score.them ?? 0}</b>
                </span>
              )}
            </div>
            {war.note && <div className="muted" style={{ marginTop: 8 }}>{war.note}</div>}
          </div>

          {TIERS.map((tier) => {
            const castles = (war.castles || []).filter((c) => c.tier === tier)
            if (castles.length === 0) return null
            return (
              <div key={tier} style={{ marginBottom: 16 }}>
                <div className="tier-head">
                  <span className={`tier-badge tier-${tier}`}>{tier}</span>
                </div>
                <div className="castle-grid">
                  {castles.map((c) => (
                    <CastleCard key={c.key} castle={c} heroMap={heroMap} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function CastleCard({ castle, heroMap }: { castle: WarCastle; heroMap: Map<string, Hero> }) {
  return (
    <div className={`card castle-card ${castle.captured ? 'captured' : ''}`}>
      <div className="row between">
        <strong>{castle.key}</strong>
        {castle.captured && <span className="badge win">함락</span>}
      </div>
      {(castle.defenses ?? []).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>상대 방덱</div>
          {castle.defenses!.map((d, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <DeckLine heroIds={d.heroes} heroMap={heroMap} />
              {d.formation && <span className="muted"> ({d.formation})</span>}
            </div>
          ))}
        </div>
      )}
      {(castle.attacks ?? []).length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>우리 공격</div>
          {castle.attacks!.map((a, i) => (
            <div key={i} className="row" style={{ marginBottom: 4 }}>
              {a.result && (
                <span className={`badge ${a.result === '승' ? 'win' : a.result === '패' ? 'lose' : '추측'}`}>
                  {a.result}
                </span>
              )}
              {a.by && <span className="muted">{a.by}</span>}
              {a.deck && a.deck.length > 0 && <DeckLine heroIds={a.deck} heroMap={heroMap} />}
              {a.note && <span className="muted" style={{ fontSize: '0.82rem' }}>{a.note}</span>}
            </div>
          ))}
        </div>
      )}
      {(castle.defenses ?? []).length === 0 && (castle.attacks ?? []).length === 0 && (
        <div className="muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>정보 없음</div>
      )}
    </div>
  )
}
