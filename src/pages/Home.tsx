import { useMemo } from 'react'
import { counterHeroNames, getAllCounters, getAllHeroes, useUserData } from '../store'
import { navigate } from '../router'
import { DeckLine } from '../components/HeroChip'

export function HomePage() {
  const userData = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const counters = getAllCounters()
  const recent = [...counters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  return (
    <div>
      <h1>낭만주의 길드</h1>
      <p className="page-desc">세븐나이츠 리버스 · 낭만주의 — 길드전 카운터덱, 공성전·파괴신 통계, 덱·영웅 관리를 한곳에서.</p>

      <div className="stat-tiles">
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('counters')}>
          <div className="num">{counters.length}</div>
          <div className="label">길드전 방어덱 공략</div>
        </div>
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('heroes')}>
          <div className="num">{heroes.length}</div>
          <div className="label">영웅 DB</div>
        </div>
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('siege')}>
          <div className="num">{userData.siegeRounds.length}</div>
          <div className="label">공성전 기록 주차</div>
        </div>
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('destroyer')}>
          <div className="num">{userData.destroyerRounds.length}</div>
          <div className="label">파괴신 기록 회차</div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <strong>최근 업데이트된 카운터 공략</strong>
          <button className="small" onClick={() => navigate('counters')}>전체 보기 →</button>
        </div>
        {recent.length === 0 && <p className="muted">아직 등록된 공략이 없어요.</p>}
        {recent.map((c) => (
          <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 10 }}>
            <div className="row">
              <span className="muted">방덱:</span>
              <DeckLine heroIds={c.defense} heroMap={heroMap} />
            </div>
            {c.counters[0] && (
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted">카운터:</span>
                <DeckLine heroIds={counterHeroNames(c.counters[0])} heroMap={heroMap} />
                {c.counters.length > 1 && <span className="muted">외 {c.counters.length - 1}개</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <strong>빠른 시작</strong>
          <ul style={{ paddingLeft: 20, margin: '8px 0 0' }}>
            <li><a href="#/counters">상대 방덱으로 카운터 검색</a></li>
            <li><a href="#/heroes">우리 덱 짜서 저장하기</a></li>
            <li><a href="#/siege">공성전 통계 보기</a></li>
            <li><a href="#/destroyer">파괴신 통계 보기</a></li>
            <li><a href="#/guide">길드전 규칙 읽기</a></li>
          </ul>
        </div>
        <div className="card">
          <strong>데이터 안내</strong>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            덱·가이드는 길드원 누구나, <b>공성전·파괴신 통계는 운영진만</b> 입력할 수 있어요.
            등록·수정한 내용은 <b>길드 공유 저장소</b>에 자동 저장돼 전원에게 반영됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
