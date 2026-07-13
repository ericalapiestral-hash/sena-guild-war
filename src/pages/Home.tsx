import { useMemo } from 'react'
import { getAllCounters, getAllHeroes, useUserData } from '../store'
import { navigate } from '../router'
import { DeckLine } from '../components/HeroChip'

export function HomePage() {
  const userData = useUserData()
  const heroes = getAllHeroes()
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])
  const counters = getAllCounters()

  const totalRecords = userData.members.flatMap((m) => m.records)
  const wins = totalRecords.filter((r) => r.result === '승').length
  const recent = [...counters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  return (
    <div>
      <h1>길드전 도우미</h1>
      <p className="page-desc">세븐나이츠 리버스 길드전 — 카운터덱 검색, 덱 관리, 길드 운영을 한곳에서.</p>

      <div className="stat-tiles">
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('counters')}>
          <div className="num">{counters.length}</div>
          <div className="label">등록된 방어덱 공략</div>
        </div>
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('heroes')}>
          <div className="num">{heroes.length}</div>
          <div className="label">영웅 DB</div>
        </div>
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('heroes')}>
          <div className="num">{userData.savedDecks.length}</div>
          <div className="label">저장된 덱</div>
        </div>
        <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => navigate('members')}>
          <div className="num">{wins}승 {totalRecords.length - wins}패</div>
          <div className="label">길드전 전적 ({userData.members.length}명)</div>
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
                <DeckLine heroIds={c.counters[0].heroes} heroMap={heroMap} />
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
            <li><a href="#/guide">길드전 규칙 읽기</a></li>
            <li><a href="#/members">길드원 등록·전적 기록</a></li>
          </ul>
        </div>
        <div className="card">
          <strong>데이터 안내</strong>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            직접 입력한 데이터는 이 브라우저에만 저장돼요.
            기기를 옮기거나 길드원과 최신 데이터를 공유하려면{' '}
            <a href="#/settings">[데이터 관리]</a>에서 내보내기/가져오기를 쓰세요.
          </p>
        </div>
      </div>
    </div>
  )
}
