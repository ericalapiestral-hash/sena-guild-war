import { useMemo } from 'react'
import type { CutlineGuide, StatEntry, StatRound } from '../types'
import { counterHeroNames, getAllArena, getAllCounters, getAllHeroes, useUserData } from '../store'
import { navigate } from '../router'
import { DeckNames } from '../components/HeroSelect'
import { Delta, cutlineFor, effOf, fmt, lastFilled, latestDayWithData, tierMap, tierShort } from '../lib/stat'

const LINKS: Array<{ route: string; label: string; desc: string }> = [
  { route: 'counters', label: '카운터덱', desc: '상대 방덱을 뚫는 조합 찾기' },
  { route: 'arena', label: '결투장', desc: '일반 · 상급 · 실시간 5인 덱' },
  { route: 'heroes', label: '영웅 · 덱', desc: '3인 덱 짜고 저장하기' },
  { route: 'guide', label: '가이드', desc: '길드전 규칙과 팁' },
]

export function HomePage() {
  const userData = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const counters = getAllCounters()
  const recent = [...counters].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 3)

  const stats: Array<{ n: number; label: string; route: string }> = [
    { n: counters.length, label: '방어덱 공략', route: 'counters' },
    { n: getAllArena().length, label: '결투장 덱', route: 'arena' },
    { n: heroes.length, label: '영웅', route: 'heroes' },
    { n: userData.siegeRounds.length, label: '공성전 주차', route: 'siege' },
    { n: userData.destroyerRounds.length, label: '파괴신 시즌', route: 'destroyer' },
  ]

  return (
    <div>
      <header className="hero-head">
        <div className="sec-label">세븐나이츠 리버스</div>
        <h1>낭만주의</h1>
        <p>길드전 카운터덱부터 공성전·파괴신 기록까지, 길드에 필요한 걸 한곳에.</p>
      </header>

      <div className="kpi-row stagger">
        {stats.map((s) => (
          <button className="kpi" key={s.route} onClick={() => navigate(s.route)}>
            <span className="kpi-n">{s.n}</span>
            <span className="kpi-l">{s.label}</span>
          </button>
        ))}
      </div>

      {/* 공성전·파괴신은 운영진만 입력하므로, 길드원에겐 최근 기록을 표로 바로 보여준다 */}
      <div className="stat-preview-row">
        <SiegePreview rounds={userData.siegeRounds} guide={userData.cutlineGuide} />
        <DestroyerPreview rounds={userData.destroyerRounds} members={userData.members} guide={userData.cutlineGuide} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="sec-label">최근 등록된 카운터</div>
          <button className="small ghost" onClick={() => navigate('counters')}>전체 보기 →</button>
        </div>
        {recent.length === 0 && <p className="muted">아직 등록된 공략이 없어요.</p>}
        <div className="recent-list stagger">
          {recent.map((c) => (
            <button key={c.id} className="recent" onClick={() => navigate('counters')}>
              <span className="recent-line">
                <em className="sec-label">방덱</em>
                <DeckNames names={c.defense} heroMap={heroMap} />
              </span>
              {c.counters[0] && (
                <span className="recent-line">
                  <em className="sec-label">카운터</em>
                  <DeckNames names={counterHeroNames(c.counters[0])} heroMap={heroMap} />
                  {c.counters.length > 1 && <em className="muted">외 {c.counters.length - 1}개</em>}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="sec-label">바로 가기</div>
        </div>
        <div className="quick-grid stagger">
          {LINKS.map((l) => (
            <button className="quick" key={l.route} onClick={() => navigate(l.route)}>
              <strong>{l.label}</strong>
              <span>{l.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="foot-note">
        덱·가이드는 길드원 누구나, <b>공성전·파괴신 기록은 운영진</b>이 입력합니다. 저장한 내용은 길드 공유 저장소에 자동 반영돼요.
      </p>
    </div>
  )
}

/** 홈 요약표 공통 뼈대 — 순위·이름·값·등락, 커트라인 미달은 붉게 */
function PreviewTable({
  route,
  title,
  subtitle,
  metric,
  rows,
  empty,
}: {
  route: string
  title: string
  subtitle?: string
  metric: string
  rows: Array<{ name: string; tier?: string; value?: number; prev?: number; fail: boolean }>
  empty: string
}) {
  const scored = rows.filter((r) => typeof r.value === 'number')
  const total = scored.reduce((s, r) => s + (r.value as number), 0)
  const failCount = rows.filter((r) => r.fail).length

  return (
    <section className="panel stat-preview">
      <div className="panel-head">
        <div>
          <div className="sec-label">{title}</div>
          {subtitle && <div className="sp-sub">{subtitle}</div>}
        </div>
        <button className="small ghost" onClick={() => navigate(route)}>전체 보기 →</button>
      </div>

      {scored.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{empty}</p>
      ) : (
        <>
          <div className="sp-facts">
            <span><b className="num-tab">{scored.length}</b><em>명 입력</em></span>
            <span><b className="num-tab">{fmt(total)}</b><em>{metric} 합계</em></span>
            {failCount > 0 && <span className="sp-fail"><b className="num-tab">{failCount}</b><em>명 미달</em></span>}
          </div>
          {/* 30명이 넘어도 홈이 길어지지 않게 표 안에서만 스크롤 — 자기 순위를 찾을 수 있게 전원 표시 */}
          <div className="sp-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>순위</th>
                  <th>길드원</th>
                  <th style={{ textAlign: 'right' }}>{metric}</th>
                  <th style={{ width: 78 }}>등락</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} className={r.fail ? 'row-fail' : ''}>
                    <td><b>{typeof r.value === 'number' ? i + 1 : '-'}</b></td>
                    <td className={r.fail ? 'cell-fail' : ''}>
                      {r.name}
                      {r.tier && <span className="sp-tier">{tierShort(r.tier)}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }} className="num-tab"><b>{fmt(r.value)}</b></td>
                    <td><Delta prev={r.prev} cur={r.value} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function SiegePreview({ rounds, guide }: { rounds: StatRound[]; guide?: CutlineGuide }) {
  const { round, index } = lastFilled(rounds, true)
  const day = latestDayWithData(round)
  const prevRound = index > 0 ? rounds[index - 1] : undefined

  const list: StatEntry[] = day ? round?.days?.[day] ?? [] : []
  const prevValues = new Map(
    (day ? prevRound?.days?.[day] ?? [] : [])
      .filter((e) => typeof e.value === 'number')
      .map((e) => [e.name, e.value as number]),
  )

  const rows = [...list]
    .filter((e) => typeof e.value === 'number')
    .sort((a, b) => (b.value as number) - (a.value as number))
    .map((e) => {
      const cut = round ? cutlineFor(round, e.name, { day, guide }) : undefined
      return {
        name: e.name,
        value: e.value,
        prev: prevValues.get(e.name),
        fail: typeof cut === 'number' && (e.value as number) <= cut,
      }
    })

  return (
    <PreviewTable
      route="siege"
      title="공성전"
      subtitle={round ? `${round.label}${day ? ` · ${day}요일` : ''}` : undefined}
      metric="점수"
      rows={rows}
      empty="아직 기록된 점수가 없어요."
    />
  )
}

function DestroyerPreview({ rounds, members, guide }: { rounds: StatRound[]; members: { name: string; tier?: string }[]; guide?: CutlineGuide }) {
  const { round, index } = lastFilled(rounds, false)
  const prevRound = index > 0 ? rounds[index - 1] : undefined
  const tierOf = tierMap(members as never)

  const prevValues = new Map(
    (prevRound?.entries ?? [])
      .filter((e) => typeof e.value === 'number')
      .map((e) => [e.name, e.value as number]),
  )

  // 시즌 도중이면 최종이 없고 중간집계만 있으므로 그것으로 순위를 낸다
  const rows = (round?.entries ?? [])
    .map((e) => ({ e, v: effOf(e, true) }))
    .filter((x) => typeof x.v === 'number')
    .sort((a, b) => (b.v as number) - (a.v as number))
    .map(({ e, v }) => {
      const cut = round ? cutlineFor(round, e.name, { tierOf, guide }) : undefined
      return { name: e.name, tier: tierOf.get(e.name), value: v, prev: prevValues.get(e.name), fail: typeof cut === 'number' && (v as number) <= cut }
    })

  const midOnly = !!round?.entries.length && round.entries.every((e) => typeof e.value !== 'number')

  return (
    <PreviewTable
      route="destroyer"
      title="파괴신"
      subtitle={round ? `${round.label}${midOnly ? ' · 중간집계' : ''}` : undefined}
      metric="딜량"
      rows={rows}
      empty="아직 기록된 딜량이 없어요."
    />
  )
}
