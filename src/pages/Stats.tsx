import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { StatEntry, StatRound, UserData } from '../types'
import { newId, todayLocal, update, useUserData } from '../store'
import { isAdmin } from '../auth'
import { Markdown } from '../components/Markdown'
import { DESTROYER_GUIDES } from '../data/destroyerGuide'

type Kind = 'siege' | 'destroyer'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const todayWeekday = () => WEEKDAYS[(new Date().getDay() + 6) % 7]

const CFG: Record<
  Kind,
  { title: string; desc: string; metric: string; field: 'siegeRounds' | 'destroyerRounds'; byDay: boolean; roundName: string; showJoined: boolean; hasCutline: boolean; deltaLabel: string }
> = {
  siege: {
    title: '공성전 통계',
    desc: '주차를 고르고 요일(월~일)마다 [편집]을 눌러 점수를 입력하고 [저장]하면 잠겨요. 각 요일 점수를 지난주 같은 요일과 비교해 등락(%)이 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
    metric: '점수',
    field: 'siegeRounds',
    byDay: true,
    roundName: '주차',
    showJoined: false,
    hasCutline: false,
    deltaLabel: '전주 대비',
  },
  destroyer: {
    title: '파괴신 통계',
    desc: '회차별로 [편집]을 눌러 길드원 딜량과 커트라인을 입력하고 [저장]하면 잠겨요. 커트라인 이하는 미달로 표시되고, 각 회차를 직전 회차와 비교해 등락(%)이 나와요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
    metric: '딜량',
    field: 'destroyerRounds',
    byDay: false,
    roundName: '회차',
    showJoined: false,
    hasCutline: true,
    deltaLabel: '전 회차 대비',
  },
}

const fmt = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString() : '-')

export function StatsPage({ kind }: { kind: Kind }) {
  const data = useUserData()
  const cfg = CFG[kind]
  const rounds = data[cfg.field]
  const admin = isAdmin()
  const roster = data.members.map((m) => m.name)
  // 파괴신에만 공략 문서 탭 (감탱이 시트 이관본)
  const guides = kind === 'destroyer' ? DESTROYER_GUIDES : null
  const [view, setView] = useState<'stats' | 'guide'>('stats')

  const [selId, setSelId] = useState<string | null>(null)
  const [day, setDay] = useState<string>(todayWeekday())
  const current = rounds.find((r) => r.id === selId) ?? rounds[rounds.length - 1] ?? null

  const stored: StatEntry[] = current ? (cfg.byDay ? current.days?.[day] ?? [] : current.entries) : []

  const currentIndex = current ? rounds.findIndex((r) => r.id === current.id) : -1
  const prevRound = currentIndex > 0 ? rounds[currentIndex - 1] : undefined
  const prevList: StatEntry[] = prevRound ? (cfg.byDay ? prevRound.days?.[day] ?? [] : prevRound.entries) : []
  const prevValues = new Map(prevList.filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]))

  function patchRounds(fn: (rs: StatRound[]) => void) {
    update((d: UserData) => { fn(d[cfg.field]) })
  }
  function patchRound(roundId: string, fn: (r: StatRound) => void) {
    patchRounds((rs) => { const r = rs.find((x) => x.id === roundId); if (r) fn(r) })
  }

  function addRound() {
    const label = prompt(`${cfg.roundName} 이름을 입력하세요. (예: ${cfg.byDay ? '7월 2주 / 시즌 12' : '1회차 / 시즌 12'})`)?.trim()
    if (!label) return
    const id = newId(kind)
    patchRounds((rs) => rs.push({ id, label, date: todayLocal(), entries: [], ...(cfg.byDay ? { days: {} } : {}) }))
    setSelId(id)
  }
  function renameRound(r: StatRound) {
    const label = prompt(`${cfg.roundName} 이름 변경`, r.label)?.trim()
    if (label) patchRound(r.id, (x) => { x.label = label })
  }
  function deleteRound(r: StatRound) {
    if (!confirm(`'${r.label}' ${cfg.roundName}를 삭제할까요? (기록 전체가 사라져요)`)) return
    patchRounds((rs) => { const i = rs.findIndex((x) => x.id === r.id); if (i >= 0) rs.splice(i, 1) })
    setSelId(null)
  }

  /** 현재 보고 있는 표를 PNG 이미지로 저장 */
  function saveImage() {
    if (!current) return
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '')
    const meta = `출력일 ${todayLocal()} · 낭만주의`
    if (cfg.byDay) {
      const d = WEEKDAYS.includes(day) ? day : WEEKDAYS[0]
      const ranked = buildRanked(roster, current.days?.[d] ?? [])
      if (!ranked.length) { alert(`${d}요일에 입력된 점수가 없어요.`); return }
      const prevMap = new Map(
        (prevRound?.days?.[d] ?? []).filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]),
      )
      const total = ranked.reduce((s, e) => s + (e.value as number), 0)
      void saveTableAsPng({
        fileName: `공성전-${safe(current.label)}-${d}요일.png`,
        title: `${cfg.title} — ${current.label} · ${d}요일`,
        meta,
        sub: `${d}요일 (${ranked.length}명 · 합계 ${fmt(total)})`,
        headers: ['순위', '길드원', '전 주', '이번 주', cfg.deltaLabel],
        aligns: ['center', 'left', 'right', 'right', 'right'],
        rows: ranked.map((e, i) => ({
          cells: [String(i + 1), e.name, fmt(prevMap.get(e.name)), fmt(e.value), pctText(prevMap.get(e.name), e.value)],
        })),
        nameCol: 1,
        deltaCol: 4,
      })
    } else {
      const ranked = buildRanked(roster, current.entries)
      if (!ranked.length) { alert('입력된 딜량이 없어요.'); return }
      const prevMap = new Map(
        (prevRound?.entries ?? []).filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]),
      )
      const total = ranked.reduce((s, e) => s + (e.value as number), 0)
      const fail = (e: StatEntry) => typeof current.cutline === 'number' && typeof e.value === 'number' && e.value <= current.cutline
      void saveTableAsPng({
        fileName: `파괴신-${safe(current.label)}.png`,
        title: `${cfg.title} — ${current.label}`,
        meta,
        sub: `${ranked.length}명 · 합계 ${fmt(total)}${typeof current.cutline === 'number' ? ` · 커트라인 ${fmt(current.cutline)} 이하 미달` : ''}`,
        headers: ['순위', '길드원', '전 시즌', '이번 시즌', '상승%'],
        aligns: ['center', 'left', 'right', 'right', 'right'],
        rows: ranked.map((e, i) => ({
          cells: [String(i + 1), e.name, fmt(prevMap.get(e.name)), fmt(e.value), pctText(prevMap.get(e.name), e.value)],
          fail: fail(e),
        })),
        nameCol: 1,
        deltaCol: 4,
      })
    }
  }

  /** [저장] — 현재 회차/요일의 기록을 통째로 교체 (편집 모드 결과 한 번에 커밋) */
  const saveAll = (list: StatEntry[], cutline?: number) => {
    if (!current) return
    patchRound(current.id, (r) => {
      if (cfg.hasCutline) r.cutline = cutline
      if (cfg.byDay) {
        if (!r.days) r.days = {}
        r.days[day] = list
      } else {
        r.entries = list
      }
    })
  }

  return (
    <div>
      <h1>{cfg.title}</h1>

      {/* 파괴신: 통계/공략 전환 탭 */}
      {guides && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button className={`small ${view === 'stats' ? 'primary' : ''}`} onClick={() => setView('stats')}>📊 통계</button>
          <button className={`small ${view === 'guide' ? 'primary' : ''}`} onClick={() => setView('guide')}>📖 공략</button>
        </div>
      )}

      {guides && view === 'guide' && (
        <>
          <p className="page-desc">파괴신 공략 정리 — 감탱이 작성 ('파괴신 정리 _ 길드공유용' 시트 이관본)</p>
          <div className="toc">
            {guides.map((s) => (
              <button key={s.id} className="small" onClick={() => {
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
              }}>{s.title}</button>
            ))}
          </div>
          {guides.map((s) => (
            <div className="card" key={s.id} id={s.id}>
              <h2 style={{ marginTop: 0 }}>{s.title}</h2>
              <Markdown text={s.body} />
            </div>
          ))}
        </>
      )}

      {(!guides || view === 'stats') && (
        <>
      <p className="page-desc">{cfg.desc}</p>

      <div className="row" style={{ marginBottom: 12 }}>
        {rounds.map((r) => (
          <button key={r.id} className={`small ${current?.id === r.id ? 'primary' : ''}`} onClick={() => setSelId(r.id)}>
            {r.label}
          </button>
        ))}
        {rounds.length === 0 && <span className="muted">아직 {cfg.roundName}가 없어요.</span>}
        <span className="spacer" />
        {admin ? (
          <button className="primary" onClick={addRound}>+ 새 {cfg.roundName}</button>
        ) : (
          <span className="muted">🔒 입력·수정은 운영진만</span>
        )}
      </div>

      {!current ? (
        <div className="card muted">기록된 {cfg.roundName}가 없어요.{admin ? ` [+ 새 ${cfg.roundName}]로 시작하세요.` : ''}</div>
      ) : (
        <div className="card">
          <div className="row between">
            <div>
              <strong style={{ fontSize: '1.1rem' }}>{current.label}</strong>
              {current.date && <span className="muted" style={{ marginLeft: 8 }}>기록 시작 {current.date}</span>}
            </div>
            <div className="row">
              <button className="small" onClick={() => window.print()}>🖨 표 인쇄</button>
              <button className="small" onClick={saveImage}>🖼 이미지 저장</button>
              {admin && (
                <>
                  <button className="small" onClick={() => renameRound(current)}>이름변경</button>
                  <button className="small danger" onClick={() => deleteRound(current)}>{cfg.roundName}삭제</button>
                </>
              )}
            </div>
          </div>

          {cfg.byDay && (
            <div className="row" style={{ marginTop: 12, gap: 6 }}>
              {WEEKDAYS.map((d) => {
                const cnt = (current.days?.[d] ?? []).filter((e) => typeof e.value === 'number').length
                return (
                  <button key={d} className={`small ${day === d ? 'primary' : ''}`} onClick={() => setDay(d)}>
                    {d}{cnt ? ` (${cnt})` : ''}
                  </button>
                )
              })}
            </div>
          )}

          <EntryTable
            key={(current.id) + (cfg.byDay ? day : '')}
            roster={roster}
            stored={stored}
            metric={cfg.metric}
            admin={admin}
            showJoined={cfg.showJoined}
            hasCutline={cfg.hasCutline}
            cutline={current.cutline}
            heading={cfg.byDay ? `${day}요일 기록` : undefined}
            prevValues={prevValues}
            deltaLabel={cfg.deltaLabel}
            onSaveAll={saveAll}
          />
        </div>
      )}

      {current && createPortal(
        <PrintContent kind={kind} cfg={cfg} current={current} prevRound={prevRound} roster={roster} day={day} />,
        document.body,
      )}
        </>
      )}
    </div>
  )
}

/** 이름 병합(길드원+외부) 후 점수 있는 사람만 내림차순 정렬 */
function buildRanked(roster: string[], stored: StatEntry[]): StatEntry[] {
  const rosterSet = new Set(roster)
  const extra = stored.map((e) => e.name).filter((n) => !rosterSet.has(n))
  const map = new Map(stored.map((e) => [e.name, e]))
  return [...roster, ...extra]
    .map((name) => ({ name, ...(map.get(name) ?? {}) } as StatEntry))
    .filter((e) => typeof e.value === 'number')
    .sort((a, b) => (b.value as number) - (a.value as number))
}

/** 등락 % 텍스트 (인쇄용, 색 없이 ▲/▼) */
function pctText(prev?: number, cur?: number): string {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return '—'
  const p = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(p) < 0.05) return '0%'
  return `${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%`
}

/** 표를 캔버스에 그려 PNG 파일로 저장 (카톡·디코 공유용) */
async function saveTableAsPng(opts: {
  fileName: string
  title: string
  meta: string
  sub: string
  headers: string[]
  aligns: Array<'left' | 'center' | 'right'>
  rows: Array<{ cells: string[]; fail?: boolean }>
  /** 미달 강조를 채울 열 (이름칸) */
  nameCol: number
  /** ▲/▼ 색을 입힐 열 */
  deltaCol: number
}) {
  try { await document.fonts.ready } catch { /* noop */ }
  const FONT = "'Pretendard Variable', Pretendard, -apple-system, 'Segoe UI', sans-serif"
  const dpr = 2
  const padX = 10
  const rowH = 32
  const headH = 34
  const margin = 20
  const titleH = 52
  const subH = 26
  const c = document.createElement('canvas')
  const g = c.getContext('2d')
  if (!g) return

  // 열 너비: 헤더·본문 실측 최대값
  const widths = opts.headers.map((h, i) => {
    g.font = `700 13px ${FONT}`
    let w = g.measureText(h).width
    g.font = `500 14px ${FONT}`
    for (const r of opts.rows) w = Math.max(w, g.measureText(r.cells[i] ?? '').width)
    return Math.ceil(w) + padX * 2
  })
  const tableW = widths.reduce((a, b) => a + b, 0)
  const W = tableW + margin * 2
  const H = margin + titleH + subH + headH + rowH * opts.rows.length + margin
  c.width = W * dpr
  c.height = H * dpr
  g.scale(dpr, dpr)
  g.textBaseline = 'middle'

  const colX = (i: number) => margin + widths.slice(0, i).reduce((a, b) => a + b, 0)
  const drawText = (text: string, i: number, top: number, h: number, font: string, color: string) => {
    g.font = `${font} ${FONT}`
    g.fillStyle = color
    const tw = g.measureText(text).width
    const tx = opts.aligns[i] === 'right' ? colX(i) + widths[i] - padX - tw
      : opts.aligns[i] === 'center' ? colX(i) + (widths[i] - tw) / 2
      : colX(i) + padX
    g.fillText(text, tx, top + h / 2 + 1)
  }

  // 배경·제목·메타
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#111'
  g.font = `800 19px ${FONT}`
  g.fillText(opts.title, margin, margin + 13)
  g.fillStyle = '#777'
  g.font = `500 11px ${FONT}`
  g.fillText(opts.meta, W - margin - g.measureText(opts.meta).width, margin + 16)
  g.strokeStyle = '#111'
  g.lineWidth = 2
  g.beginPath(); g.moveTo(margin, margin + 33); g.lineTo(W - margin, margin + 33); g.stroke()
  g.fillStyle = '#444'
  g.font = `600 13px ${FONT}`
  g.fillText(opts.sub, margin, margin + titleH + 9)

  // 헤더
  const y0 = margin + titleH + subH
  g.fillStyle = '#eee'
  g.fillRect(margin, y0, tableW, headH)
  opts.headers.forEach((h, i) => drawText(h, i, y0, headH, '700 13px', '#111'))

  // 본문
  opts.rows.forEach((r, k) => {
    const top = y0 + headH + k * rowH
    if (r.fail) {
      g.fillStyle = '#f4bfba'
      g.fillRect(colX(opts.nameCol), top, widths[opts.nameCol], rowH)
    }
    r.cells.forEach((cell, i) => {
      let color = '#111'
      let font = '500 14px'
      if (i === opts.nameCol) font = '600 14px'
      if (i === opts.deltaCol) {
        color = cell.startsWith('▲') ? '#188a42' : cell.startsWith('▼') ? '#cf3f36' : '#888'
        font = '600 13px'
      }
      drawText(cell, i, top, rowH, font, color)
    })
  })

  // 격자선
  g.strokeStyle = '#bbb'
  g.lineWidth = 1
  for (let k = 0; k <= opts.rows.length; k++) {
    const ly = y0 + headH + k * rowH
    g.beginPath(); g.moveTo(margin, ly); g.lineTo(margin + tableW, ly); g.stroke()
  }
  for (let i = 0; i <= opts.headers.length; i++) {
    const lx = i === opts.headers.length ? margin + tableW : colX(i)
    g.beginPath(); g.moveTo(lx, y0); g.lineTo(lx, y0 + headH + rowH * opts.rows.length); g.stroke()
  }
  g.strokeStyle = '#999'
  g.beginPath(); g.moveTo(margin, y0 + headH); g.lineTo(margin + tableW, y0 + headH); g.stroke()

  c.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = opts.fileName
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

/** 화면엔 숨김(.print-root), 인쇄 시에만 보이는 표. body에 portal로 렌더. */
function PrintContent({
  kind,
  cfg,
  current,
  prevRound,
  roster,
  day,
}: {
  kind: Kind
  cfg: (typeof CFG)[Kind]
  current: StatRound
  prevRound?: StatRound
  roster: string[]
  /** 공성전: 화면에서 선택된 요일 — 그 요일만 인쇄 */
  day?: string
}) {
  const printedAt = todayLocal()

  if (cfg.byDay) {
    // 공성전 — 화면에서 보고 있는 요일 하나만 인쇄 (지난주 같은 요일 대비 %)
    const d = day && WEEKDAYS.includes(day) ? day : WEEKDAYS[0]
    const ranked = buildRanked(roster, current.days?.[d] ?? [])
    const prevMap = new Map(
      (prevRound?.days?.[d] ?? []).filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]),
    )
    const total = ranked.reduce((s, e) => s + (e.value as number), 0)
    return (
      <div className="print-root">
        <div className="print-head">
          <h2>{cfg.title} — {current.label} · {d}요일</h2>
          <span className="print-meta">출력일 {printedAt} · 낭만주의</span>
        </div>
        {ranked.length === 0 ? (
          <p>{d}요일에 입력된 점수가 없어요.</p>
        ) : (
          <div className="print-block">
            <h3>{d}요일 <span className="print-sub">({ranked.length}명 · 합계 {fmt(total)})</span></h3>
            <table className="print-table">
              <thead><tr><th>순위</th><th>길드원</th><th>전 주</th><th>이번 주</th><th>{cfg.deltaLabel}</th></tr></thead>
              <tbody>
                {ranked.map((e, i) => (
                  <tr key={e.name}>
                    <td>{i + 1}</td><td>{e.name}</td>
                    <td className="num-tab">{fmt(prevMap.get(e.name))}</td>
                    <td className="num-tab">{fmt(e.value)}</td>
                    <td>{pctText(prevMap.get(e.name), e.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // 파괴신 — 전 시즌 · 이번 시즌 · 상승% 한 표에
  const curRanked = buildRanked(roster, current.entries)
  const prevMap = new Map(
    (prevRound?.entries ?? []).filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]),
  )
  const curTotal = curRanked.reduce((s, e) => s + (e.value as number), 0)
  // 커트라인 이하 미달자 — 이름칸 강조
  const isFail = (e: StatEntry) => typeof current.cutline === 'number' && typeof e.value === 'number' && e.value <= current.cutline
  return (
    <div className="print-root">
      <div className="print-head">
        <h2>{cfg.title}</h2>
        <span className="print-meta">출력일 {printedAt} · 낭만주의</span>
      </div>
      <div className="print-block">
        <h3>
          이번 시즌: {current.label}
          <span className="print-sub"> ({curRanked.length}명 · 합계 {fmt(curTotal)}{prevRound ? ` · 전 시즌: ${prevRound.label} 대비 상승%` : ''})</span>
        </h3>
        <table className="print-table">
          <thead><tr><th>순위</th><th>길드원</th><th>전 시즌</th><th>이번 시즌</th><th>상승%</th></tr></thead>
          <tbody>
            {curRanked.map((e, i) => (
              <tr key={e.name}>
                <td>{i + 1}</td><td className={isFail(e) ? 'cell-fail' : ''}>{e.name}</td>
                <td className="num-tab">{fmt(prevMap.get(e.name))}</td>
                <td className="num-tab">{fmt(e.value)}</td>
                <td>{pctText(prevMap.get(e.name), e.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 전 주차(회차) 대비 상승/하락 % */
function Delta({ prev, cur }: { prev?: number; cur?: number }) {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return <span className="muted">—</span>
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(pct) < 0.05) return <span className="delta">0%</span>
  const up = pct > 0
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

function EntryTable({
  roster,
  stored,
  metric,
  admin,
  showJoined,
  hasCutline,
  cutline,
  heading,
  prevValues,
  deltaLabel,
  onSaveAll,
}: {
  roster: string[]
  stored: StatEntry[]
  metric: string
  admin: boolean
  showJoined: boolean
  hasCutline: boolean
  cutline?: number
  heading?: string
  prevValues: Map<string, number>
  deltaLabel: string
  onSaveAll: (list: StatEntry[], cutline?: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, Partial<StatEntry>>>({})
  const [draftCutline, setDraftCutline] = useState<number | undefined>(undefined)
  const [localExtra, setLocalExtra] = useState<string[]>([])
  const [newName, setNewName] = useState('')

  const rosterSet = new Set(roster)
  const storedMap = new Map(stored.map((e) => [e.name, e]))
  const storedExtra = stored.map((e) => e.name).filter((n) => !rosterSet.has(n))
  const baseNames = [...roster, ...storedExtra, ...localExtra.filter((n) => !rosterSet.has(n) && !storedExtra.includes(n))]

  const valOf = (name: string): Partial<StatEntry> => (editing ? draft[name] ?? {} : storedMap.get(name) ?? {})
  const rows: StatEntry[] = baseNames.map((name) => ({ name, ...valOf(name) }))

  const scored = rows.filter((e) => typeof e.value === 'number')
  const total = scored.reduce((s, e) => s + (e.value as number), 0)
  const joinedCount = rows.filter((e) => e.joined).length
  const ranked = [...rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  const top = scored.length ? ranked[0] : undefined
  const displayRows = editing ? rows : ranked // 편집 중엔 명단 순서 고정, 잠금 시 점수순 정렬

  const effCutline = editing ? draftCutline : cutline
  const showVerdict = hasCutline && typeof effCutline === 'number'
  const isFail = (e: StatEntry) => showVerdict && typeof e.value === 'number' && e.value <= (effCutline as number)
  const failCount = rows.filter(isFail).length
  const cols = 5 + (showJoined ? 1 : 0) + (showVerdict ? 1 : 0) + (editing ? 1 : 0)

  function startEdit() {
    const d: Record<string, Partial<StatEntry>> = {}
    for (const name of baseNames) { const e = storedMap.get(name); if (e) d[name] = { value: e.value, joined: e.joined, memo: e.memo } }
    setDraft(d)
    setDraftCutline(cutline)
    setLocalExtra([])
    setEditing(true)
  }
  const setField = (name: string, patch: Partial<StatEntry>) => setDraft((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  function save() {
    const list = baseNames
      .map((name) => ({ name, ...(draft[name] ?? {}) } as StatEntry))
      .filter((e) => typeof e.value === 'number' || e.joined || (e.memo ?? '').trim())
    onSaveAll(list, hasCutline ? draftCutline : undefined)
    setEditing(false)
    setLocalExtra([])
  }
  function cancel() {
    setEditing(false)
    setLocalExtra([])
    setDraft({})
  }
  function addExternal() {
    const n = newName.trim()
    setNewName('')
    if (!n || baseNames.includes(n)) return
    setLocalExtra((prev) => [...prev, n])
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        {heading ? <div className="cc-sec">{heading}</div> : <span />}
        {admin && !editing && <button className="primary small" onClick={startEdit}>✏️ {metric} 입력·수정</button>}
        {admin && editing && <span className="delta up" style={{ fontSize: '0.85rem' }}>✏️ 편집 중 — 아래 [저장]을 눌러야 반영돼요</span>}
      </div>

      {hasCutline && editing && (
        <div className="row" style={{ marginBottom: 10 }}>
          <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>커트라인 ({metric})</label>
          <input type="number" className="num-tab" value={draftCutline ?? ''} placeholder="예: 8000000"
            onChange={(ev) => setDraftCutline(ev.target.value === '' ? undefined : Number(ev.target.value))}
            style={{ width: 170, textAlign: 'right' }} />
          <span className="muted" style={{ fontSize: '0.8rem' }}>이 값 이하는 미달로 표시돼요</span>
        </div>
      )}
      {hasCutline && !editing && typeof cutline === 'number' && (
        <div className="muted" style={{ marginBottom: 10 }}>커트라인 <b className="num-tab" style={{ color: 'var(--text)' }}>{fmt(cutline)}</b> {metric} 이하는 <span className="badge lose">미달</span></div>
      )}

      <div className="stat-tiles" style={{ margin: '0 0 6px' }}>
        <div className="stat-tile"><div className="num">{scored.length}<span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>/{rows.length}</span></div><div className="label">{metric} 입력</div></div>
        {showJoined && <div className="stat-tile"><div className="num">{joinedCount}</div><div className="label">참여 인원</div></div>}
        {showVerdict && <div className="stat-tile"><div className="num" style={{ color: failCount ? 'var(--danger)' : 'var(--ok)' }}>{failCount}</div><div className="label">미달 인원</div></div>}
        <div className="stat-tile"><div className="num">{fmt(total)}</div><div className="label">{metric} 합계</div></div>
        <div className="stat-tile"><div className="num" style={{ fontSize: '1.15rem' }}>{top ? top.name : '-'}</div><div className="label">{metric} 1위 ({fmt(top?.value)})</div></div>
      </div>

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>{editing ? '#' : '순위'}</th>
              <th>길드원</th>
              <th style={{ textAlign: 'right' }}>{metric}</th>
              <th style={{ width: 100 }}>{deltaLabel}</th>
              {showVerdict && <th style={{ width: 64 }}>판정</th>}
              {showJoined && <th style={{ width: 60 }}>참여</th>}
              <th>메모</th>
              {editing && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols} className="muted">[길드원] 메뉴에 등록된 사람이 없어요. 먼저 길드원을 등록해주세요.</td></tr>
            )}
            {displayRows.map((e, i) => (
              <tr key={e.name} className={isFail(e) ? 'row-fail' : ''}>
                <td><b>{editing ? i + 1 : typeof e.value === 'number' ? i + 1 : '-'}</b></td>
                <td className={isFail(e) ? 'cell-fail' : ''}><b>{e.name}</b>{!rosterSet.has(e.name) && <span className="muted" style={{ marginLeft: 4, fontSize: '0.75rem' }}>(외부)</span>}</td>
                <td style={{ textAlign: 'right' }}>{editing ? (
                  <input type="number" value={e.value ?? ''} placeholder="0" className="num-tab"
                    onChange={(ev) => setField(e.name, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                    style={{ width: 120, textAlign: 'right' }} />
                ) : (<b className="num-tab">{fmt(e.value)}</b>)}</td>
                <td><Delta prev={prevValues.get(e.name)} cur={e.value} /></td>
                {showVerdict && <td>{typeof e.value === 'number' ? (isFail(e) ? <span className="badge lose">미달</span> : <span className="badge win">통과</span>) : <span className="muted">—</span>}</td>}
                {showJoined && <td>{editing ? (
                  <input type="checkbox" checked={!!e.joined} onChange={(ev) => setField(e.name, { joined: ev.target.checked })} />
                ) : (<span className={`badge ${e.joined ? 'win' : 'lose'}`}>{e.joined ? 'O' : 'X'}</span>)}</td>}
                <td>{editing ? (
                  <input value={e.memo ?? ''} placeholder="메모" onChange={(ev) => setField(e.name, { memo: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                ) : (<span className="muted">{e.memo || ''}</span>)}</td>
                {editing && <td>{!rosterSet.has(e.name) && <button className="small danger" onClick={() => setLocalExtra((prev) => prev.filter((x) => x !== e.name))}>✕</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 하단 저장/취소 (편집 모드) */}
      {admin && editing && (
        <>
          <div className="row" style={{ marginTop: 12 }}>
            <input placeholder="외부(비길드원) 이름 추가" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addExternal() }} />
            <button className="small" onClick={addExternal}>+ 추가</button>
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={cancel}>취소</button>
            <button className="primary" onClick={save}>💾 저장</button>
          </div>
        </>
      )}
    </div>
  )
}
