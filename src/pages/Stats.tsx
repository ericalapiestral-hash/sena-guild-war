import { useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import type { CutlineGuide, StatEntry, StatRound, UserData } from '../types'
import { activeMembers, excludedMembers, newId, rosterNames, todayLocal, update, useUserData } from '../store'
import { isAdmin } from '../auth'
import { Markdown } from '../components/Markdown'
import { DESTROYER_GUIDES } from '../data/destroyerGuide'
import { Delta, WEEKDAYS, fmt, tierShort, todayWeekday } from '../lib/stat'
import { ScoreImport } from '../components/ScoreImport'

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
    desc: '주차를 고르고 요일(월~일)마다 [편집]을 눌러 점수를 입력하고 [저장]하면 잠겨요. 각 요일 점수를 지난주 같은 요일과 비교해 등락(%)이 표시돼요. 점수는 [📷 캡처에서 읽기]로 결과 화면을 붙여넣으면 자동으로 채워져요. 커트라인은 [커트라인] 메뉴의 요일별 기준표를 따르고, 이하 점수는 미달로 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
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
    desc: '시즌별로 [편집]을 눌러 중간집계·최종 딜량을 입력하고 [저장]하면 잠겨요. 딜량은 [📷 캡처에서 읽기]로 결과 화면을 붙여넣으면 자동으로 채워지는데, 중간집계와 최종 집계 중 어디에 넣을지 고를 수 있어요. 전 시즌 / 이번 시즌 중간집계 / 이번 시즌 집계를 나란히 비교하고, [커트라인] 메뉴의 파이 초월 단계별 기준 이하는 미달로 표시돼요. 명단은 [길드원] 메뉴 등록자가 자동으로 들어옵니다.',
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
  // 명단은 '지금 길드에 있는' 사람만 — 외부 처리한 계정은 미달·누락 집계 대상이 아니다.
  // 지난 회차에 남아 있는 그들의 점수는 storedExtra(외부) 경로로 그대로 표에 남는다.
  const roster = rosterNames(data.members)
  // 캡처 판독에는 외부 계정 이름도 넘긴다 — 복귀 처리를 깜빡한 채 캡처를 올려도
  // 이름이 엉뚱하게 붙지 않고, 수동 선택 목록에서도 고를 수 있게.
  const knownExtra = excludedMembers(data.members).map((m) => m.name)
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
  // 이름→등급은 외부 계정까지 담아 둔다 — 그들이 외부 행으로 남아 있을 때
  // 엉뚱한 기본 커트라인 대신 본인 등급 기준이 적용되도록.
  const tierOf = new Map(data.members.filter((m) => m.tier).map((m) => [m.name, m.tier as string]))
  // 커트라인을 입력할 등급 목록은 활동 중인 사람 기준 — 아무도 없는 등급까지 칸을 만들 필요는 없다
  const tierList = [...new Set(activeMembers(data.members).map((m) => m.tier).filter((t): t is string => !!t))].sort()
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
  const saveAll = (list: StatEntry[]) => {
    if (!current) return
    patchRound(current.id, (r) => {
      // ★ 커트라인(cutline·dayCutlines·tierCutlines)은 건드리지 않는다.
      //   통계 화면에서 더 이상 편집하지 않으므로 저장할 값도 없고, 예전처럼
      //   빈 값을 받아 delete 하면 지난 회차에 박혀 있던 기준이 통째로 날아간다.
      //   앞으로의 기준은 [커트라인] 메뉴의 기준표가 담당한다.
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
            knownExtra={knownExtra}
            stored={stored}
            metric={cfg.metric}
            admin={admin}
            showJoined={cfg.showJoined}
            hasCutline={cfg.hasCutline}
            cutline={curCutline}
            guide={data.cutlineGuide}
            dayKey={cfg.byDay ? day : undefined}
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
            onSaveAll={saveAll}
          />
        </div>
      )}

      {current && createPortal(
        <PrintContent kind={kind} cfg={cfg} current={current} prevRound={prevRound} roster={roster} day={day} tierOf={cfg.byDay ? undefined : tierOf} guide={data.cutlineGuide} />,
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
  guide,
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
  /** [커트라인] 메뉴의 기준표 — 화면 표와 같은 판정을 쓰도록 함께 넘긴다 */
  guide?: CutlineGuide
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
    // 요일별 커트라인 — 회차 저장값 → [커트라인] 기준표 → 주차 공통값
    const dayCut = current.dayCutlines?.[d] ?? guide?.siegeByDay?.[d] ?? current.cutline
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
  // 커트라인 이하 미달자 — 회차에 저장된 값 → [커트라인] 기준표 → 시즌 기본값
  const tierCuts = current.tierCutlines ?? {}
  const cutFor = (name: string) => {
    const t = tierOf?.get(name)
    const tc = t !== undefined ? tierCuts[t] : undefined
    if (typeof tc === 'number') return tc
    const gt = t !== undefined ? guide?.destroyerByTier?.[t] : undefined
    if (typeof gt === 'number') return gt
    return current.cutline
  }
  const isFail = (e: StatEntry) => {
    const c = cutFor(e.name)
    return typeof c === 'number' && typeof effValue(e) === 'number' && (effValue(e) as number) <= c
  }
  /** 인쇄용 등급 커트라인 — 화면과 같은 순서(회차 저장값 → 기준표) */
  const tierCutOf = (t: string): number | undefined => {
    const tc = tierCuts[t]
    if (typeof tc === 'number') return tc
    const gt = guide?.destroyerByTier?.[t]
    return typeof gt === 'number' ? gt : undefined
  }
  const usedTiers = [...new Set(curRanked.map((e) => tierOf?.get(e.name)).filter((t): t is string => !!t && typeof tierCutOf(t) === 'number'))].sort()
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
            <> · 커트라인 {usedTiers.map((t) => `${t} ${fmt(tierCutOf(t))}`).join(' / ')}
              {typeof current.cutline === 'number' && `${usedTiers.length ? ' / ' : ''}${usedTiers.length ? '기본 ' : ''}${fmt(current.cutline)}`} 이하 미달</>
          )}
        </div>
        <table className="print-table">
          <thead><tr><th>순위</th><th>길드원</th><th>전 시즌</th>{hasMid && <th>중간집계</th>}<th>이번 시즌 집계</th><th>전 시즌 대비</th>{hasMid && <th>중간집계 대비</th>}</tr></thead>
          <tbody>
            {curRanked.map((e, i) => (
              <tr key={e.name}>
                <td>{i + 1}</td>
                <td className={isFail(e) ? 'cell-fail' : ''}>
                  {e.name}
                  {tierOf?.get(e.name) && <span className="print-tier">{tierShort(tierOf.get(e.name))}</span>}
                </td>
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
  knownExtra,
  stored,
  metric,
  admin,
  showJoined,
  hasCutline,
  cutline,
  guide,
  dayKey,
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
  onSaveAll,
}: {
  roster: string[]
  /** 명단 밖이지만 이름은 아는 계정 (외부 처리한 길드원) — 캡처 판독 후보로만 쓴다 */
  knownExtra?: string[]
  stored: StatEntry[]
  metric: string
  admin: boolean
  showJoined: boolean
  hasCutline: boolean
  cutline?: number
  /** [커트라인] 메뉴의 기준표 — 회차에 저장된 값이 없을 때 여기서 가져온다 */
  guide?: CutlineGuide
  /** 공성전: 지금 보고 있는 요일 (기준표의 요일별 커트라인을 찾는 키) */
  dayKey?: string
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
  onSaveAll: (list: StatEntry[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, Partial<StatEntry>>>({})
  const [localExtra, setLocalExtra] = useState<string[]>([])
  /** 편집 중 표에 쓸 이름 순서 (점수순으로 얼려 둔 값) */
  const [editOrder, setEditOrder] = useState<string[]>([])
  /** 편집 중 ✕로 지운 외부(비명단) 이름 — 저장 시 기록에서 제거됨 */
  const [removedExtra, setRemovedExtra] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [importing, setImporting] = useState(false)

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

  /**
   * 순위 숫자 — 표에 놓인 자리가 아니라 '지금 값'으로 매긴다.
   * 편집 중에는 표 순서를 얼려 두기 때문에(아래 참고), 자리로 번호를 매기면
   * 방금 점수를 넣은 사람이 맨 아래 자리의 번호를 달고 있게 된다.
   * 동점이면 같은 순위가 나오는데, 자리 번호보다 이쪽이 사실에 가깝다.
   */
  const rankOf = (e: StatEntry): number | undefined => {
    const v = effOf(e)
    if (typeof v !== 'number') return undefined
    return rows.filter((o) => (effOf(o) ?? -Infinity) > v).length + 1
  }

  /**
   * 편집 중 표 순서. 점수순으로 보되 **타이핑 중에는 얼려 둔다** —
   * 값이 바뀔 때마다 다시 정렬하면 한 글자 칠 때마다 행이 뛰어다닌다.
   * 편집 시작·캡처 적용·[다시 정렬] 때만 새로 잡는다.
   * 편집 중에 추가된 외부 이름은 순서 목록에 없으므로 뒤로 보낸다.
   */
  const orderIdx = new Map(editOrder.map((n, i) => [n, i]))
  const editRows = editOrder.length
    ? [...rows].sort((a, b) => (orderIdx.get(a.name) ?? Infinity) - (orderIdx.get(b.name) ?? Infinity))
    : rows
  const displayRows = editing ? editRows : ranked

  // 커트라인은 회차에 저장된 값 → [커트라인] 기준표 → 회차 기본값 순으로 찾는다.
  // (통계 화면에서는 더 이상 편집하지 않으므로 편집/보기 상태를 구분하지 않는다)
  const effCutline = cutline
  const effTierCuts = tierCutlines ?? {}
  /** 이 사람에게 적용되는 커트라인 */
  const cutFor = (name: string): number | undefined => {
    const t = tierOf?.get(name)
    const tc = t !== undefined ? effTierCuts[t] : undefined
    if (typeof tc === 'number') return tc
    const gt = t !== undefined ? guide?.destroyerByTier?.[t] : undefined
    if (typeof gt === 'number') return gt
    if (dayKey) {
      const gd = guide?.siegeByDay?.[dayKey]
      if (typeof gd === 'number') return gd
    }
    return effCutline
  }
  /** 등급 하나에 적용되는 커트라인 (표시용) */
  const cutForTier = (t: string): number | undefined => {
    const tc = effTierCuts[t]
    if (typeof tc === 'number') return tc
    const gt = guide?.destroyerByTier?.[t]
    return typeof gt === 'number' ? gt : undefined
  }
  /** 등급이 없는 사람에게 적용되는 값 (표시용) */
  const baseCut = dayKey
    ? (effCutline ?? guide?.siegeByDay?.[dayKey])
    : effCutline
  // 실제로 적용되는 커트라인이 한 명이라도 있으면 판정을 보여 준다
  const showVerdict = hasCutline && rows.some((e) => typeof cutFor(e.name) === 'number')
  const isFail = (e: StatEntry) => {
    if (!showVerdict) return false
    const c = cutFor(e.name)
    return typeof c === 'number' && typeof effOf(e) === 'number' && (effOf(e) as number) <= c
  }
  const failCount = rows.filter(isFail).length

  const cols = 5 + (showMid ? 3 : 0) + (showJoined ? 1 : 0) + (showVerdict ? 1 : 0) + (editing ? 1 : 0)

  /** 주어진 값 기준 점수순 이름 배열 — 편집 표의 순서를 잡는 데 쓴다 */
  function rankedNames(source: Record<string, Partial<StatEntry>>, names: string[]): string[] {
    const val = (n: string) => {
      const e = source[n] ?? {}
      return typeof e.value === 'number' ? e.value : showMid && typeof e.mid === 'number' ? e.mid : undefined
    }
    return [...names].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity))
  }

  function startEdit() {
    const d: Record<string, Partial<StatEntry>> = {}
    for (const name of baseNames) { const e = storedMap.get(name); if (e) d[name] = { value: e.value, mid: e.mid, joined: e.joined, memo: e.memo } }
    setDraft(d)
    setLocalExtra([])
    setRemovedExtra([])
    setEditOrder(rankedNames(d, baseNames))
    setEditing(true)
  }
  const setField = (name: string, patch: Partial<StatEntry>) => setDraft((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  function save() {
    const list = baseNames
      .map((name) => ({ name, ...(draft[name] ?? {}) } as StatEntry))
      .filter((e) => typeof e.value === 'number' || typeof e.mid === 'number' || e.joined || (e.memo ?? '').trim())
    onSaveAll(list)
    setEditing(false)
    setLocalExtra([])
    setRemovedExtra([])
    setEditOrder([])
  }
  function cancel() {
    setEditing(false)
    setLocalExtra([])
    setRemovedExtra([])
    setDraft({})
    setEditOrder([])
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
        {admin && editing && (
          <span className="row" style={{ gap: 8 }}>
            <button className="small" onClick={() => setImporting(true)}>📷 캡처에서 읽기</button>
            {/* 손으로 입력하면 순서를 얼려 둔 채로 두다가, 다 넣고 나서 이걸로 정렬 */}
            <button className="small" title="지금 입력된 값 기준으로 표를 점수순으로 다시 정렬합니다"
              onClick={() => setEditOrder(rankedNames(draft, baseNames))}>↕ 점수순 다시 정렬</button>
            <span className="delta up" style={{ fontSize: '0.85rem' }}>✏️ 편집 중 — 아래 [저장]을 눌러야 반영돼요</span>
          </span>
        )}
      </div>

      {importing && (
        <ScoreImport
          roster={baseNames}
          extraNames={(knownExtra ?? []).filter((n) => !baseNames.includes(n))}
          metric={metric}
          // 파괴신은 중간집계·최종 두 칸이라 어디에 넣을지 물어본다.
          // 시즌 도중 캡처가 최종 집계로 잘못 들어가면 순위·미달이 통째로 어긋난다.
          targets={showMid ? [{ key: 'mid', label: '중간집계' }, { key: 'value', label: finalLabel }] : undefined}
          onClose={() => setImporting(false)}
          onApply={(values, target) => {
            const field = target === 'mid' ? 'mid' : 'value'
            const next = { ...draft }
            for (const { name, value } of values) next[name] = { ...next[name], [field]: value }
            setDraft(next)
            // 캡처를 넣었으면 순위가 확 바뀐다 — 이때는 표 순서를 새로 잡아 준다
            setEditOrder(rankedNames(next, baseNames))
          }}
        />
      )}

      {/* 커트라인 입력칸은 없앴다 — [커트라인] 메뉴의 기준표 한 곳에서만 관리한다.
          등급이 늘면서 편집할 때마다 입력칸이 10칸 넘게 쌓여 점수 입력을 밀어냈다. */}
      {hasCutline && editing && (
        <p className="cutline-note">
          커트라인은 <b>[커트라인]</b> 메뉴의 기준표를 따릅니다.
          {' '}지난 회차에 따로 저장된 값이 있으면 그 회차는 그 값을 그대로 씁니다.
        </p>
      )}
      {/* 실제로 적용 중인 커트라인을 보여 준다 — 회차 저장값이든 기준표에서 온 값이든
          사람이 보기엔 '지금 이 표에 적용된 값'이 중요하다 */}
      {hasCutline && !editing && showVerdict && (
        <div className="muted" style={{ marginBottom: 10 }}>
          커트라인{' '}
          {useTiers && tierList!.filter((t) => typeof cutForTier(t) === 'number').map((t) => (
            <span key={t}>
              {t} <b className="num-tab" style={{ color: 'var(--text)' }}>{fmt(cutForTier(t))}</b>
              {' / '}
            </span>
          ))}
          {typeof baseCut === 'number' && (
            <span>{useTiers ? '기본 ' : ''}<b className="num-tab" style={{ color: 'var(--text)' }}>{fmt(baseCut)}</b></span>
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
                <td><b>{rankOf(e) ?? '-'}</b></td>
                <td className={isFail(e) ? 'cell-fail' : ''}>
                  <b>{e.name}</b>
                  {tierOf?.get(e.name) && <span className="muted" style={{ marginLeft: 4, fontSize: '0.72rem' }}>{tierShort(tierOf.get(e.name))}</span>}
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
