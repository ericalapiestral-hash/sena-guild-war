import { useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import type { StatEntry, StatRound, UserData } from '../types'
import { newId, todayLocal, update, useUserData } from '../store'
import { isAdmin } from '../auth'
import { Markdown } from '../components/Markdown'
import { DESTROYER_GUIDES } from '../data/destroyerGuide'
import { Delta, WEEKDAYS, fmt, todayWeekday } from '../lib/stat'

type Kind = 'siege' | 'destroyer'

const CFG: Record<
  Kind,
  {
    title: string; desc: string; metric: string; field: 'siegeRounds' | 'destroyerRounds'
    byDay: boolean; roundName: string; showJoined: boolean; hasCutline: boolean; deltaLabel: string
    /** 중간집계 열 사용 (파괴신) */
    showMid: boolean
    /** 직전 기록 열 제목 */
    prevLabel: string
    /** 최종 집계 열 제목 */
    finalLabel: string
  }
> = {
  siege: {
    title: '공성전 통계',
    desc: '주차를 고르고 요일(월~일)마다 [편집]을 눌러 점수를 입력하고 [저장]하면 잠겨요. 각 요일 점수를 지난주 같은 요일과 비교해 등락(%)이 표시돼요. 소탕한 사람은 [소탕](지난주 점수 그대로) · [-10%](지난주 -10%) 버튼으로 바로 채울 수 있어요. 커트라인은 요일마다 따로 설정할 수 있고, 이하 점수는 미달로 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
    metric: '점수',
    field: 'siegeRounds',
    byDay: true,
    roundName: '주차',
    showJoined: false,
    hasCutline: true,
    deltaLabel: '전주 대비',
    showMid: false,
    prevLabel: '전 주',
    finalLabel: '이번 주',
  },
  destroyer: {
    title: '파괴신 통계',
    desc: '시즌별로 [편집]을 눌러 중간집계·최종 딜량과 커트라인을 입력하고 [저장]하면 잠겨요. 전 시즌 / 이번 시즌 중간집계 / 이번 시즌 집계를 나란히 비교하고, 커트라인 이하는 미달로 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
    metric: '딜량',
    field: 'destroyerRounds',
    byDay: false,
    roundName: '시즌',
    showJoined: false,
    hasCutline: true,
    deltaLabel: '전 시즌 대비',
    showMid: true,
    prevLabel: '전 시즌',
    finalLabel: '이번 시즌 집계',
  },
}


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
  // 공성전은 요일마다 기준점이 달라 요일별 커트라인 사용 (없으면 주차 공통값으로 폴백)
  const curCutline = current
    ? (cfg.byDay ? current.dayCutlines?.[day] ?? current.cutline : current.cutline)
    : undefined
  // 파괴신: 길드원 등급(영웅 초월 단계)별 커트라인 — 이름→등급, 등급 목록
  const tierOf = new Map(data.members.filter((m) => m.tier).map((m) => [m.name, m.tier as string]))
  const tierList = [...new Set(data.members.map((m) => m.tier).filter((t): t is string => !!t))].sort()
  const tierCutlines = current?.tierCutlines

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

  /** 현재 보고 있는 표를 PNG 이미지로 저장 — 인쇄 뷰(.print-root)를 그대로 캡처 */
  async function saveImage() {
    if (!current) return
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '')
    let fileName: string
    if (cfg.byDay) {
      const d = WEEKDAYS.includes(day) ? day : WEEKDAYS[0]
      if (!(current.days?.[d] ?? []).some((e) => typeof e.value === 'number')) {
        alert(`${d}요일에 입력된 점수가 없어요.`)
        return
      }
      fileName = `공성전-${safe(current.label)}-${d}요일.png`
    } else {
      if (!current.entries.some((e) => typeof e.value === 'number' || typeof e.mid === 'number')) {
        alert('입력된 딜량이 없어요.')
        return
      }
      fileName = `파괴신-${safe(current.label)}.png`
    }

    const src = document.querySelector('.print-root')
    if (!(src instanceof HTMLElement)) return
    // 인쇄와 같은 스타일로, 폭만 촘촘하게(600px) 렌더해 캡처 — 칸 안 빈 공간 축소.
    // 화면 밖에 배치(주의: opacity:0/visibility:hidden으로 숨기면 html2canvas가 빈 이미지를 만든다)
    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;background:#fff;padding:20px;z-index:-1;'
    const clone = src.cloneNode(true) as HTMLElement
    clone.style.display = 'block'
    wrap.appendChild(clone)
    document.body.appendChild(wrap)
    try {
      try { await document.fonts.ready } catch { /* noop */ }
      // 캡처 크기를 표 전체 크기로 명시 — 기본값은 '브라우저 창' 크기라
      // 인원이 많아 표가 창보다 길면 아래가 잘림 (30명 이상에서 발생)
      const w = Math.ceil(wrap.scrollWidth)
      const h = Math.ceil(wrap.scrollHeight)
      const canvas = await html2canvas(wrap, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        width: w,
        height: h,
        windowWidth: w,
        windowHeight: h,
        scrollX: 0,
        scrollY: 0,
      })
      const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      wrap.remove()
    }
  }

  /** [저장] — 현재 회차/요일의 기록을 통째로 교체 (편집 모드 결과 한 번에 커밋) */
  const saveAll = (list: StatEntry[], cutline?: number, tierCuts?: Record<string, number>) => {
    if (!current) return
    patchRound(current.id, (r) => {
      // 파괴신: 등급별 커트라인 저장 (빈 값은 제거)
      if (!cfg.byDay && cfg.hasCutline) {
        if (tierCuts && Object.keys(tierCuts).length) r.tierCutlines = tierCuts
        else delete r.tierCutlines
      }
      if (cfg.byDay) {
        // 공성전: 커트라인을 요일별로 저장
        if (cfg.hasCutline) {
          if (!r.dayCutlines) r.dayCutlines = {}
          if (typeof cutline === 'number') r.dayCutlines[day] = cutline
          else delete r.dayCutlines[day]
        }
        if (!r.days) r.days = {}
        r.days[day] = list
      } else {
        if (cfg.hasCutline) r.cutline = cutline
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
              <button className="small" onClick={() => void saveImage()}>🖼 이미지 저장</button>
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
            cutline={curCutline}
            cutlineLabel={cfg.byDay ? `커트라인 (${day}요일 ${cfg.metric})` : `기본 커트라인 (${cfg.metric})`}
            tierOf={cfg.byDay ? undefined : tierOf}
            tierList={cfg.byDay ? undefined : tierList}
            tierCutlines={tierCutlines}
            heading={cfg.byDay ? `${day}요일 기록` : undefined}
            prevValues={prevValues}
            deltaLabel={cfg.deltaLabel}
            showMid={cfg.showMid}
            prevLabel={cfg.prevLabel}
            finalLabel={cfg.finalLabel}
            prevRoundLabel={prevRound?.label}
            canSweep={cfg.byDay}
            onSaveAll={saveAll}
          />
        </div>
      )}

      {current && createPortal(
        <PrintContent kind={kind} cfg={cfg} current={current} prevRound={prevRound} roster={roster} day={day} tierOf={cfg.byDay ? undefined : tierOf} />,
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
  // 최종 집계가 없으면 중간집계 기준 (시즌 도중에도 출력 가능)
  const eff = (e: StatEntry) => (typeof e.value === 'number' ? e.value : e.mid)
  return [...roster, ...extra]
    .map((name) => ({ name, ...(map.get(name) ?? {}) } as StatEntry))
    .filter((e) => typeof eff(e) === 'number')
    .sort((a, b) => (eff(b) as number) - (eff(a) as number))
}

/** 집계 기준값 — 최종 우선, 없으면 중간집계 */
function effValue(e: StatEntry): number | undefined {
  return typeof e.value === 'number' ? e.value : e.mid
}

/** 등락 % 텍스트 (인쇄용, 색 없이 ▲/▼) */
function pctText(prev?: number, cur?: number): string {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return '—'
  const p = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(p) < 0.05) return '0%'
  return `${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%`
}


/** 화면엔 숨김(.print-root), 인쇄 시에만 보이는 표. body에 portal로 렌더. */
function PrintContent({
  kind,
  cfg,
  current,
  prevRound,
  roster,
  day,
  tierOf,
}: {
  kind: Kind
  cfg: (typeof CFG)[Kind]
  current: StatRound
  prevRound?: StatRound
  roster: string[]
  /** 공성전: 화면에서 선택된 요일 — 그 요일만 인쇄 */
  day?: string
  /** 파괴신: 길드원 이름 → 등급 */
  tierOf?: Map<string, string>
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
    // 요일별 커트라인 (없으면 주차 공통값)
    const dayCut = current.dayCutlines?.[d] ?? current.cutline
    const isFail = (e: StatEntry) => typeof dayCut === 'number' && typeof e.value === 'number' && e.value <= dayCut
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
            <h3>{d}요일</h3>
            <div className="print-sub">
              {ranked.length}명 · 합계 {fmt(total)}
              {typeof dayCut === 'number' && <> · 커트라인 {fmt(dayCut)} 이하 미달</>}
            </div>
            <table className="print-table">
              <thead><tr><th>순위</th><th>길드원</th><th>전 주</th><th>이번 주</th><th>{cfg.deltaLabel}</th></tr></thead>
              <tbody>
                {ranked.map((e, i) => (
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
        )}
      </div>
    )
  }

  // 파괴신 — 전 시즌 · 이번 시즌 · 상승% 한 표에
  const curRanked = buildRanked(roster, current.entries)
  const prevMap = new Map(
    (prevRound?.entries ?? []).filter((e) => typeof e.value === 'number').map((e) => [e.name, e.value as number]),
  )
  const curTotal = curRanked.reduce((s, e) => s + (effValue(e) as number), 0)
  const hasMid = curRanked.some((e) => typeof e.mid === 'number')
  // 커트라인 이하 미달자 — 등급별 커트라인 우선, 없으면 시즌 기본값
  const tierCuts = current.tierCutlines ?? {}
  const cutFor = (name: string) => {
    const t = tierOf?.get(name)
    const tc = t !== undefined ? tierCuts[t] : undefined
    return typeof tc === 'number' ? tc : current.cutline
  }
  const isFail = (e: StatEntry) => {
    const c = cutFor(e.name)
    return typeof c === 'number' && typeof effValue(e) === 'number' && (effValue(e) as number) <= c
  }
  const usedTiers = [...new Set(curRanked.map((e) => tierOf?.get(e.name)).filter((t): t is string => !!t && typeof tierCuts[t] === 'number'))].sort()
  return (
    <div className="print-root">
      <div className="print-head">
        <h2>{cfg.title}</h2>
        <span className="print-meta">출력일 {printedAt} · 낭만주의</span>
      </div>
      <div className="print-block">
        <h3>이번 시즌: {current.label}</h3>
        <div className="print-sub">
          {curRanked.length}명 · 합계 {fmt(curTotal)}
          {prevRound && <> · 전 시즌: {prevRound.label}</>}
          {(usedTiers.length > 0 || typeof current.cutline === 'number') && (
            <> · 커트라인 {usedTiers.map((t) => `${t} ${fmt(tierCuts[t])}`).join(' / ')}
              {typeof current.cutline === 'number' && `${usedTiers.length ? ' / ' : ''}${usedTiers.length ? '기본 ' : ''}${fmt(current.cutline)}`} 이하 미달</>
          )}
        </div>
        <table className="print-table">
          <thead><tr><th>순위</th><th>길드원</th>{usedTiers.length > 0 && <th>등급</th>}<th>전 시즌</th>{hasMid && <th>중간집계</th>}<th>이번 시즌 집계</th><th>전 시즌 대비</th>{hasMid && <th>중간집계 대비</th>}</tr></thead>
          <tbody>
            {curRanked.map((e, i) => (
              <tr key={e.name}>
                <td>{i + 1}</td><td className={isFail(e) ? 'cell-fail' : ''}>{e.name}</td>
                {usedTiers.length > 0 && <td style={{ textAlign: 'left' }}>{tierOf?.get(e.name) ?? '-'}</td>}
                <td className="num-tab">{fmt(prevMap.get(e.name))}</td>
                {hasMid && <td className="num-tab">{fmt(e.mid)}</td>}
                <td className="num-tab">{fmt(e.value)}</td>
                <td>{pctText(prevMap.get(e.name), effValue(e))}</td>
                {hasMid && <td>{pctText(e.mid, e.value)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 전 주차(회차) 대비 상승/하락 % */

function EntryTable({
  roster,
  stored,
  metric,
  admin,
  showJoined,
  hasCutline,
  cutline,
  cutlineLabel,
  tierOf,
  tierList,
  tierCutlines,
  heading,
  prevValues,
  deltaLabel,
  showMid,
  prevLabel,
  finalLabel,
  prevRoundLabel,
  canSweep,
  onSaveAll,
}: {
  roster: string[]
  stored: StatEntry[]
  metric: string
  admin: boolean
  showJoined: boolean
  hasCutline: boolean
  cutline?: number
  cutlineLabel?: string
  /** 길드원 이름 → 등급 (파괴신) */
  tierOf?: Map<string, string>
  /** 등급 목록 (파괴신) */
  tierList?: string[]
  /** 등급별 커트라인 (파괴신) */
  tierCutlines?: Record<string, number>
  heading?: string
  prevValues: Map<string, number>
  deltaLabel: string
  showMid: boolean
  prevLabel: string
  finalLabel: string
  prevRoundLabel?: string
  /** 소탕 버튼 사용 (공성전) — 지난주 같은 요일 점수를 그대로/-10%로 채운다 */
  canSweep?: boolean
  onSaveAll: (list: StatEntry[], cutline?: number, tierCuts?: Record<string, number>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, Partial<StatEntry>>>({})
  const [draftCutline, setDraftCutline] = useState<number | undefined>(undefined)
  const [draftTierCuts, setDraftTierCuts] = useState<Record<string, number>>({})
  const [localExtra, setLocalExtra] = useState<string[]>([])
  /** 편집 중 ✕로 지운 외부(비명단) 이름 — 저장 시 기록에서 제거됨 */
  const [removedExtra, setRemovedExtra] = useState<string[]>([])
  const [newName, setNewName] = useState('')

  const useTiers = !!tierList?.length

  const rosterSet = new Set(roster)
  const storedMap = new Map(stored.map((e) => [e.name, e]))
  const storedExtra = stored.map((e) => e.name).filter((n) => !rosterSet.has(n) && !removedExtra.includes(n))
  const baseNames = [...roster, ...storedExtra, ...localExtra.filter((n) => !rosterSet.has(n) && !storedExtra.includes(n))]

  const valOf = (name: string): Partial<StatEntry> => (editing ? draft[name] ?? {} : storedMap.get(name) ?? {})
  const rows: StatEntry[] = baseNames.map((name) => ({ name, ...valOf(name) }))

  // 집계 기준값 — 최종이 있으면 최종, 없으면 중간집계 (시즌 도중에도 순위·합계가 나오게)
  const effOf = (e: StatEntry) => (typeof e.value === 'number' ? e.value : showMid ? e.mid : undefined)
  const scored = rows.filter((e) => typeof effOf(e) === 'number')
  const total = scored.reduce((s, e) => s + (effOf(e) as number), 0)
  const midCount = rows.filter((e) => typeof e.mid === 'number').length
  const finalCount = rows.filter((e) => typeof e.value === 'number').length
  const joinedCount = rows.filter((e) => e.joined).length
  const ranked = [...rows].sort((a, b) => (effOf(b) ?? -Infinity) - (effOf(a) ?? -Infinity))
  const top = scored.length ? ranked[0] : undefined
  const displayRows = editing ? rows : ranked // 편집 중엔 명단 순서 고정, 잠금 시 점수순 정렬

  const effCutline = editing ? draftCutline : cutline
  const effTierCuts = editing ? draftTierCuts : (tierCutlines ?? {})
  /** 이 사람에게 적용되는 커트라인 — 등급별 값이 있으면 그것, 없으면 기본값 */
  const cutFor = (name: string): number | undefined => {
    const t = tierOf?.get(name)
    const tc = t !== undefined ? effTierCuts[t] : undefined
    return typeof tc === 'number' ? tc : effCutline
  }
  const showVerdict = hasCutline && (typeof effCutline === 'number' || Object.values(effTierCuts).some((v) => typeof v === 'number'))
  const isFail = (e: StatEntry) => {
    if (!showVerdict) return false
    const c = cutFor(e.name)
    return typeof c === 'number' && typeof effOf(e) === 'number' && (effOf(e) as number) <= c
  }
  const failCount = rows.filter(isFail).length

  // ---- 소탕 ----
  // 소탕은 지난주 같은 요일 점수를 그대로, -10% 소탕은 거기서 10% 깎아 가져온다.
  // 지난주 기록이 있어야 의미가 있으므로 값이 하나도 없으면 열 자체를 감춘다.
  // offset: 실제 게임 점수에 맞추는 보정. -10% 소탕은 계산값보다 1점 높게 들어온다.
  const SWEEPS = [
    { key: 'full', ratio: 1, offset: 0, short: '소탕', full: '소탕', desc: '지난주 그대로' },
    { key: 'cut', ratio: 0.9, offset: 1, short: '-10%', full: '-10% 소탕', desc: '지난주 -10% +1' },
  ] as const
  const sweepOn = !!canSweep && editing && prevValues.size > 0
  /** 소탕 점수 = 지난주 점수 × 비율(반올림) + 보정 */
  const sweptValue = (name: string, ratio: number, offset: number): number | undefined => {
    const p = prevValues.get(name)
    return typeof p === 'number' ? Math.round(p * ratio) + offset : undefined
  }
  const applySweep = (name: string, ratio: number, offset: number): void => {
    const v = sweptValue(name, ratio, offset)
    if (typeof v === 'number') setField(name, { value: v })
  }
  /** 아직 비어 있는 칸만 채운다 — 이미 입력한 점수를 실수로 덮어쓰지 않게 */
  const sweepEmpty = (ratio: number, offset: number): void => {
    setDraft((prev) => {
      const next = { ...prev }
      for (const name of baseNames) {
        if (typeof next[name]?.value === 'number') continue
        const v = sweptValue(name, ratio, offset)
        if (typeof v === 'number') next[name] = { ...next[name], value: v }
      }
      return next
    })
  }
  const emptyCount = baseNames.filter(
    (n) => typeof draft[n]?.value !== 'number' && typeof prevValues.get(n) === 'number',
  ).length

  const cols = 5 + (showMid ? 3 : 0) + (showJoined ? 1 : 0) + (showVerdict ? 1 : 0) + (sweepOn ? 1 : 0) + (editing ? 1 : 0)

  function startEdit() {
    const d: Record<string, Partial<StatEntry>> = {}
    for (const name of baseNames) { const e = storedMap.get(name); if (e) d[name] = { value: e.value, mid: e.mid, joined: e.joined, memo: e.memo } }
    setDraft(d)
    setDraftCutline(cutline)
    setDraftTierCuts({ ...(tierCutlines ?? {}) })
    setLocalExtra([])
    setRemovedExtra([])
    setEditing(true)
  }
  const setField = (name: string, patch: Partial<StatEntry>) => setDraft((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  function save() {
    const list = baseNames
      .map((name) => ({ name, ...(draft[name] ?? {}) } as StatEntry))
      .filter((e) => typeof e.value === 'number' || typeof e.mid === 'number' || e.joined || (e.memo ?? '').trim())
    onSaveAll(list, hasCutline ? draftCutline : undefined, hasCutline && useTiers ? draftTierCuts : undefined)
    setEditing(false)
    setLocalExtra([])
    setRemovedExtra([])
  }
  function cancel() {
    setEditing(false)
    setLocalExtra([])
    setRemovedExtra([])
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

      {sweepOn && (
        <div className="row" style={{ marginBottom: 10, gap: 8 }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            소탕 — 지난주{prevRoundLabel ? ` (${prevRoundLabel})` : ''} 같은 요일 점수 기준
          </span>
          {SWEEPS.map((s) => (
            <button
              key={s.key}
              className="small"
              disabled={emptyCount === 0}
              title={
                emptyCount === 0
                  ? '빈 칸이 없어요. 개별 소탕은 각 줄의 버튼을 쓰세요.'
                  : `점수가 비어 있는 ${emptyCount}명을 ${s.full}(${s.desc}) 값으로 채웁니다. 이미 입력된 점수는 그대로 둡니다.`
              }
              onClick={() => sweepEmpty(s.ratio, s.offset)}
            >
              {s.full} 일괄 ({s.desc})
            </button>
          ))}
          {emptyCount > 0 && <span className="muted" style={{ fontSize: '0.8rem' }}>빈 칸 {emptyCount}명</span>}
        </div>
      )}

      {hasCutline && editing && (
        <div style={{ marginBottom: 10 }}>
          {/* 등급별 커트라인 (파괴신) — 길드원 등급마다 기준점이 달라 개별 설정 */}
          {useTiers && tierList!.map((t) => (
            <div className="row" key={t} style={{ marginBottom: 6 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem', minWidth: 120 }}>{t}</label>
              <input type="number" className="num-tab" value={draftTierCuts[t] ?? ''} placeholder="비우면 기본값 적용"
                onChange={(ev) => setDraftTierCuts((prev) => {
                  const next = { ...prev }
                  if (ev.target.value === '') delete next[t]
                  else next[t] = Number(ev.target.value)
                  return next
                })}
                style={{ width: 170, textAlign: 'right' }} />
              <span className="muted" style={{ fontSize: '0.8rem' }}>등급 커트라인</span>
            </div>
          ))}
          <div className="row">
            <label style={{ fontWeight: 600, fontSize: '0.85rem', minWidth: useTiers ? 120 : undefined }}>{cutlineLabel ?? `커트라인 (${metric})`}</label>
            <input type="number" className="num-tab" value={draftCutline ?? ''} placeholder="예: 8000000"
              onChange={(ev) => setDraftCutline(ev.target.value === '' ? undefined : Number(ev.target.value))}
              style={{ width: 170, textAlign: 'right' }} />
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              {useTiers ? '등급이 없거나 등급 값이 빈 사람에게 적용' : '이 값 이하는 미달로 표시돼요'}
            </span>
          </div>
        </div>
      )}
      {hasCutline && !editing && showVerdict && (
        <div className="muted" style={{ marginBottom: 10 }}>
          커트라인{' '}
          {useTiers && tierList!.filter((t) => typeof effTierCuts[t] === 'number').map((t) => (
            <span key={t}>
              {t} <b className="num-tab" style={{ color: 'var(--text)' }}>{fmt(effTierCuts[t])}</b>
              {' / '}
            </span>
          ))}
          {typeof cutline === 'number' && (
            <span>{useTiers ? '기본 ' : ''}<b className="num-tab" style={{ color: 'var(--text)' }}>{fmt(cutline)}</b></span>
          )}
          {' '}{metric} 이하는 <span className="badge lose">미달</span>
        </div>
      )}

      <div className="stat-tiles stagger" style={{ margin: '0 0 6px' }}>
        {showMid ? (
          <>
            <div className="stat-tile"><div className="num">{midCount}<span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>/{rows.length}</span></div><div className="label">중간집계 입력</div></div>
            <div className="stat-tile"><div className="num">{finalCount}<span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>/{rows.length}</span></div><div className="label">최종 집계 입력</div></div>
          </>
        ) : (
          <div className="stat-tile"><div className="num">{scored.length}<span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>/{rows.length}</span></div><div className="label">{metric} 입력</div></div>
        )}
        {showJoined && <div className="stat-tile"><div className="num">{joinedCount}</div><div className="label">참여 인원</div></div>}
        {showVerdict && <div className="stat-tile"><div className="num" style={{ color: failCount ? 'var(--danger)' : 'var(--ok)' }}>{failCount}</div><div className="label">미달 인원</div></div>}
        <div className="stat-tile"><div className="num">{fmt(total)}</div><div className="label">{metric} 합계</div></div>
        <div className="stat-tile"><div className="num" style={{ fontSize: '1.15rem' }}>{top ? top.name : '-'}</div><div className="label">{metric} 1위 ({fmt(top ? effOf(top) : undefined)})</div></div>
      </div>

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>{editing ? '#' : '순위'}</th>
              <th>길드원</th>
              {showMid && <th style={{ textAlign: 'right' }}>{prevLabel}{prevRoundLabel ? <span className="muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}> ({prevRoundLabel})</span> : ''}</th>}
              {showMid && <th style={{ textAlign: 'right' }}>중간집계</th>}
              <th style={{ textAlign: 'right' }}>{showMid ? finalLabel : metric}</th>
              {sweepOn && <th style={{ width: 132 }}>소탕</th>}
              <th style={{ width: 100 }}>{deltaLabel}</th>
              {showMid && <th style={{ width: 110 }}>중간집계 대비</th>}
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
                <td><b>{editing ? i + 1 : typeof effOf(e) === 'number' ? i + 1 : '-'}</b></td>
                <td className={isFail(e) ? 'cell-fail' : ''}>
                  <b>{e.name}</b>
                  {tierOf?.get(e.name) && <span className="muted" style={{ marginLeft: 4, fontSize: '0.72rem' }}>{tierOf.get(e.name)}</span>}
                  {!rosterSet.has(e.name) && <span className="muted" style={{ marginLeft: 4, fontSize: '0.75rem' }}>(외부)</span>}
                </td>
                {showMid && <td style={{ textAlign: 'right' }} className="num-tab muted">{fmt(prevValues.get(e.name))}</td>}
                {showMid && <td style={{ textAlign: 'right' }}>{editing ? (
                  <input type="number" value={e.mid ?? ''} placeholder="0" className="num-tab"
                    onChange={(ev) => setField(e.name, { mid: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                    style={{ width: 120, textAlign: 'right' }} />
                ) : (<span className="num-tab">{fmt(e.mid)}</span>)}</td>}
                <td style={{ textAlign: 'right' }}>{editing ? (
                  <input type="number" value={e.value ?? ''} placeholder="0" className="num-tab"
                    onChange={(ev) => setField(e.name, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                    style={{ width: 120, textAlign: 'right' }} />
                ) : (<b className="num-tab">{fmt(e.value)}</b>)}</td>
                {sweepOn && (
                  <td>
                    {typeof prevValues.get(e.name) === 'number' ? (
                      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        {SWEEPS.map((s) => (
                          <button
                            key={s.key}
                            className="small"
                            title={`${s.full} — 지난주 ${fmt(prevValues.get(e.name))}점 → ${fmt(sweptValue(e.name, s.ratio, s.offset))}점`}
                            onClick={() => applySweep(e.name, s.ratio, s.offset)}
                          >
                            {s.short}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.78rem' }}>지난주 기록 없음</span>
                    )}
                  </td>
                )}
                <td><Delta prev={prevValues.get(e.name)} cur={effOf(e)} /></td>
                {showMid && <td><Delta prev={e.mid} cur={e.value} /></td>}
                {showVerdict && <td>{typeof effOf(e) === 'number' ? (isFail(e) ? <span className="badge lose">미달</span> : <span className="badge win">통과</span>) : <span className="muted">—</span>}</td>}
                {showJoined && <td>{editing ? (
                  <input type="checkbox" checked={!!e.joined} onChange={(ev) => setField(e.name, { joined: ev.target.checked })} />
                ) : (<span className={`badge ${e.joined ? 'win' : 'lose'}`}>{e.joined ? 'O' : 'X'}</span>)}</td>}
                <td>{editing ? (
                  <input value={e.memo ?? ''} placeholder="메모" onChange={(ev) => setField(e.name, { memo: ev.target.value })} style={{ width: '100%', minWidth: 90 }} />
                ) : (<span className="muted">{e.memo || ''}</span>)}</td>
                {editing && <td>{!rosterSet.has(e.name) && <button className="small danger" title="이 외부 인원 기록 삭제 (저장 시 반영)" onClick={() => {
                  // 이번 편집에서 방금 추가한 이름이면 목록에서만 빼고,
                  // 이미 저장돼 있던 외부 항목이면 삭제 표시 → [저장] 때 기록에서 제거
                  setLocalExtra((prev) => prev.filter((x) => x !== e.name))
                  setRemovedExtra((prev) => (prev.includes(e.name) ? prev : [...prev, e.name]))
                }}>✕</button>}</td>}
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
