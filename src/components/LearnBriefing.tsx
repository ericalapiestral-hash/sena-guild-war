import { useEffect, useState } from 'react'
import { WORKER_URL } from '../data/config'
import { isAdmin } from '../auth'
import { getAllHeroes } from '../store'

/** 워커가 학습해 온 최신 브리핑 */
interface LearnItem {
  feedId: number
  title: string
  date: string
  board: string
  url: string
  category: '공성전' | '파괴신' | '결투장' | '기타'
  summary: string
  heroes: string[]
}
interface LearnData {
  at: number
  freshCount?: number
  items: LearnItem[]
  newHeroes: string[]
  meta: string
}

const base = WORKER_URL.replace(/\/+$/, '')

const CATEGORY_CLASS: Record<string, string> = {
  공성전: 'cat-siege',
  파괴신: 'cat-destroyer',
  결투장: 'cat-arena',
  기타: 'cat-etc',
}

/**
 * '최신 공략 브리핑' — 공식 라운지에서 학습해 온 길드전 글 요약.
 * 데이터는 워커 KV에 있어 길드원 전원이 같은 브리핑을 본다.
 *
 * 홈에 있다가 브리핑 품질 문제로 한 번 내려갔고(31007dd), 워커 쪽 분류 필터가
 * 고쳐진 뒤 운영진 전용 [데이터] 페이지로 되돌아왔다. 홈에는 다시 걸지 말 것 —
 * 길드원 전원에게 보이면 오분류 글 하나가 그대로 노출된다.
 *
 * [새 글 학습]은 서버가 10분에 1번으로 제한한다.
 */
export function LearnBriefing() {
  const [data, setData] = useState<LearnData | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!base) return
    fetch(`${base}/learn/latest`)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.items)) setData(d)
      })
      .catch(() => {})
  }, [])

  if (!base) return null

  async function learnNow() {
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      const res = await fetch(`${base}/learn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ heroes: getAllHeroes().map((h) => h.name) }),
      })
      const d = await res.json()
      if (d.ok && Array.isArray(d.items)) {
        setData(d)
        setNote(d.freshCount === 0 ? '새 길드전 글이 없어요.' : `새 글 ${d.freshCount}개를 학습했어요.`)
      } else {
        setNote(d.error || '학습에 실패했어요.')
        if (d.latest && Array.isArray(d.latest.items)) setData(d.latest)
      }
    } catch {
      setNote('서버에 연결하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const admin = isAdmin()
  if (!data && !admin) return null

  const items = data?.items ?? []
  const shown = open ? items : items.slice(0, 3)

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="sec-label">
          최신 공략 브리핑
          {data && (
            <em className="learn-when">
              {new Date(data.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 학습
            </em>
          )}
        </div>
        {admin && (
          <button className="small ghost" disabled={busy} onClick={() => void learnNow()}>
            {busy ? '라운지 읽는 중…' : '🔭 새 글 학습'}
          </button>
        )}
      </div>

      {note && <p className="learn-note">{note}</p>}

      {data && data.newHeroes.length > 0 && (
        <p className="learn-new-heroes">
          🆕 신규 영웅 후보: <b>{data.newHeroes.join(', ')}</b>
          {admin && <span className="muted"> — 확인 후 영웅 목록에 등록해 주세요</span>}
        </p>
      )}

      {items.length === 0 ? (
        <p className="muted">
          아직 학습한 글이 없어요.{admin ? ' [새 글 학습]을 눌러 공식 라운지에서 가져와 보세요.' : ''}
        </p>
      ) : (
        <>
          {data?.meta && <p className="learn-meta">{data.meta}</p>}
          <div className="learn-list stagger">
            {shown.map((it) => (
              <a key={it.feedId} className="learn-item" href={it.url} target="_blank" rel="noreferrer">
                <span className="learn-line1">
                  <em className={`learn-cat ${CATEGORY_CLASS[it.category] ?? 'cat-etc'}`}>{it.category}</em>
                  <strong>{it.title}</strong>
                </span>
                <span className="learn-summary">{it.summary}</span>
              </a>
            ))}
          </div>
          {items.length > 3 && (
            <button className="small" style={{ marginTop: 8 }} onClick={() => setOpen((v) => !v)}>
              {open ? '접기' : `${items.length - 3}개 더 보기`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
