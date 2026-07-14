import { useState } from 'react'
import { navigate, useRoute } from './router'
import { Icon } from './components/Icon'
import { HomePage } from './pages/Home'
import { CountersPage } from './pages/Counters'
import { HeroesPage } from './pages/Heroes'
import { GuidePage } from './pages/Guide'
import { MembersPage } from './pages/Members'
import { SettingsPage } from './pages/Settings'
import { SearchPage } from './pages/Search'

interface MenuItem {
  route: string
  label: string
  icon: string
}

const MENU: MenuItem[] = [
  { route: 'home', label: '홈', icon: 'home' },
  { route: 'counters', label: '카운터덱', icon: 'target' },
  { route: 'heroes', label: '영웅 · 덱', icon: 'shield' },
  { route: 'guide', label: '가이드', icon: 'book' },
  { route: 'search', label: 'AI 검색', icon: 'search' },
  { route: 'members', label: '길드원', icon: 'users' },
  { route: 'settings', label: '데이터', icon: 'data' },
]

// 모바일 하단 탭바: 주요 4개 + 더보기
const PRIMARY = ['home', 'counters', 'heroes', 'guide']
const MORE = MENU.filter((m) => !PRIMARY.includes(m.route))

const Brand = () => (
  <span className="logo"><span className="em">⚔️</span>낭만주의</span>
)

export default function App() {
  const route = useRoute()
  const base = route.split('/')[0]
  const [sheet, setSheet] = useState(false)
  const moreActive = MORE.some((m) => m.route === base)

  return (
    <>
      {/* 데스크톱 상단 네비게이션 */}
      <header className="topbar">
        <Brand />
        <nav>
          {MENU.map((m) => (
            <button
              key={m.route}
              className={base === m.route ? 'active' : ''}
              onClick={() => navigate(m.route)}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      {/* 모바일 상단 앱바 */}
      <header className="mobile-appbar">
        <Brand />
      </header>

      <main>
        {base === 'home' && <HomePage />}
        {base === 'counters' && <CountersPage />}
        {base === 'heroes' && <HeroesPage />}
        {base === 'guide' && <GuidePage />}
        {base === 'search' && <SearchPage />}
        {base === 'members' && <MembersPage />}
        {base === 'settings' && <SettingsPage />}
      </main>

      <div className="footer-note">
        낭만주의 · 세븐나이츠 리버스 길드전 도우미 — 데이터는 이 브라우저에 저장됩니다. 공유하려면 [데이터 관리]에서 내보내기.
      </div>

      {/* 모바일 하단 탭바 */}
      <nav className="bottom-nav">
        {PRIMARY.map((r) => {
          const m = MENU.find((x) => x.route === r)!
          return (
            <button
              key={r}
              className={base === r ? 'active' : ''}
              onClick={() => navigate(r)}
            >
              <Icon name={m.icon} className="ic" />
              {m.label}
            </button>
          )
        })}
        <button className={moreActive ? 'active' : ''} onClick={() => setSheet(true)}>
          <Icon name="menu" className="ic" />
          더보기
        </button>
      </nav>

      {/* 더보기 시트 */}
      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="더보기 메뉴">
            <div className="sheet-handle" />
            {MORE.map((m) => (
              <button
                key={m.route}
                className={`sheet-item ${base === m.route ? 'active' : ''}`}
                onClick={() => { navigate(m.route); setSheet(false) }}
              >
                <Icon name={m.icon} className="ic" />
                {({ 'AI 검색': 'AI 공략검색', 데이터: '데이터 관리', 길드원: '길드원 관리' } as Record<string, string>)[m.label] ?? m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
