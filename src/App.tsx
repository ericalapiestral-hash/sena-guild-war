import { navigate, useRoute } from './router'
import { HomePage } from './pages/Home'
import { CountersPage } from './pages/Counters'
import { HeroesPage } from './pages/Heroes'
import { GuidePage } from './pages/Guide'
import { MembersPage } from './pages/Members'
import { SettingsPage } from './pages/Settings'
import { SearchPage } from './pages/Search'

const MENU: { route: string; label: string }[] = [
  { route: 'home', label: '홈' },
  { route: 'counters', label: '카운터덱 사전' },
  { route: 'heroes', label: '영웅 · 덱 빌더' },
  { route: 'guide', label: '공략 가이드' },
  { route: 'search', label: 'AI 공략검색' },
  { route: 'members', label: '길드원 관리' },
  { route: 'settings', label: '데이터 관리' },
]

export default function App() {
  const route = useRoute()
  const base = route.split('/')[0]

  return (
    <>
      <header className="topbar">
        <span className="logo">⚔️ 세나 리버스 길드전</span>
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
        세븐나이츠 리버스 길드전 도우미 — 데이터는 이 브라우저에 저장됩니다. 다른 기기와 공유하려면 [데이터 관리]에서 내보내기.
      </div>
    </>
  )
}
