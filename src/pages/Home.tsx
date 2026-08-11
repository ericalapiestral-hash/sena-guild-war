import { useMemo } from 'react'
import { counterHeroNames, getAllArena, getAllCounters, getAllHeroes, useUserData } from '../store'
import { navigate } from '../router'
import { DeckNames } from '../components/HeroSelect'

const LINKS: Array<{ route: string; label: string; desc: string }> = [
  { route: 'counters', label: '카운터덱', desc: '상대 방덱을 뚫는 조합 찾기' },
  { route: 'arena', label: '결투장', desc: '일반 · 상급 · 실시간 5인 덱' },
  { route: 'heroes', label: '영웅 · 덱', desc: '3인 덱 짜고 저장하기' },
  { route: 'siege', label: '공성전', desc: '요일별 점수·순위' },
  { route: 'destroyer', label: '파괴신', desc: '시즌 딜량·커트라인' },
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
