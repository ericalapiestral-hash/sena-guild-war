import { useState } from 'react'
import { navigate, useRoute } from './router'
import { Icon } from './components/Icon'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HomePage } from './pages/Home'
import { CountersPage } from './pages/Counters'
import { HeroesPage } from './pages/Heroes'
import { GuidePage } from './pages/Guide'
import { StatsPage } from './pages/Stats'
import { MembersPage } from './pages/Members'
import { SettingsPage } from './pages/Settings'
import { AdminLogin } from './pages/AdminLogin'
import { ADMIN_ROUTES, isAdmin, logout } from './auth'

interface MenuItem {
  route: string
  label: string
  icon: string
  admin?: boolean
}

const MENU: MenuItem[] = [
  { route: 'home', label: '홈', icon: 'home' },
  { route: 'counters', label: '카운터덱', icon: 'target' },
  { route: 'heroes', label: '영웅 · 덱', icon: 'shield' },
  { route: 'guide', label: '가이드', icon: 'book' },
  { route: 'siege', label: '공성전', icon: 'siege' },
  { route: 'destroyer', label: '파괴신', icon: 'destroyer' },
  { route: 'members', label: '길드원', icon: 'users', admin: true },
  { route: 'settings', label: '데이터', icon: 'data', admin: true },
]

const PRIMARY = ['home', 'counters', 'heroes', 'guide']
const SECONDARY = ['siege', 'destroyer'] // 모바일 '더보기' 시트에 노출 (전원 열람)
const ADMIN_ITEMS = MENU.filter((m) => m.admin)
const fullLabel = (label: string) =>
  ({ 데이터: '데이터 관리', 길드원: '길드원 관리', 공성전: '공성전 통계', 파괴신: '파괴신 통계' } as Record<string, string>)[label] ?? label

const Brand = () => (
  <span className="logo"><span className="em">⚔️</span>낭만주의</span>
)

function AdminHome({ onLogout }: { onLogout: () => void }) {
  return (
    <div>
      <h1>관리자 메뉴</h1>
      <p className="page-desc">운영진 전용 페이지예요. 아래에서 이동하세요.</p>
      <div className="grid-2">
        {ADMIN_ITEMS.map((m) => (
          <button key={m.route} className="admin-tile" onClick={() => navigate(m.route)}>
            <Icon name={m.icon} className="ic" />
            <span>{fullLabel(m.label)}</span>
          </button>
        ))}
      </div>
      <button className="danger" style={{ marginTop: 16 }} onClick={onLogout}>로그아웃</button>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const base = route.split('/')[0]
  const [sheet, setSheet] = useState(false)
  const [admin, setAdmin] = useState(isAdmin())

  const visible = MENU.filter((m) => !m.admin || admin)
  const adminActive = ADMIN_ITEMS.some((m) => m.route === base) || base === 'admin'
  const moreActive = adminActive || SECONDARY.includes(base)
  const needLogin = (ADMIN_ROUTES.includes(base) || base === 'admin') && !admin

  function doLogout() {
    logout()
    setAdmin(false)
    navigate('home')
  }

  return (
    <>
      {/* 데스크톱 상단 네비게이션 */}
      <header className="topbar">
        <Brand />
        <nav>
          {visible.map((m) => (
            <button key={m.route} className={base === m.route ? 'active' : ''} onClick={() => navigate(m.route)}>
              {m.label}
            </button>
          ))}
          {admin ? (
            <button className="nav-lock" onClick={doLogout} title="관리자 로그아웃">🔓 로그아웃</button>
          ) : (
            <button className={`nav-lock ${base === 'admin' ? 'active' : ''}`} onClick={() => navigate('admin')}>
              🔒 관리자
            </button>
          )}
        </nav>
      </header>

      {/* 모바일 상단 앱바 */}
      <header className="mobile-appbar">
        <Brand />
      </header>

      <main>
        {/* key={base}: 오류가 나도 다른 페이지로 이동하면 오류 상태가 풀림 */}
        <ErrorBoundary key={base}>
          {needLogin ? (
            <AdminLogin
              onSuccess={() => {
                setAdmin(true)
                if (base === 'admin') navigate('members')
              }}
            />
          ) : (
            <>
              {base === 'home' && <HomePage />}
              {base === 'counters' && <CountersPage />}
              {base === 'heroes' && <HeroesPage />}
              {base === 'guide' && <GuidePage />}
              {base === 'siege' && <StatsPage kind="siege" />}
              {base === 'destroyer' && <StatsPage kind="destroyer" />}
              {base === 'members' && <MembersPage />}
              {base === 'settings' && <SettingsPage />}
              {base === 'admin' && admin && <AdminHome onLogout={doLogout} />}
              {!['home', 'counters', 'heroes', 'guide', 'siege', 'destroyer', 'members', 'settings', 'admin'].includes(base) && <HomePage />}
            </>
          )}
        </ErrorBoundary>
      </main>

      <div className="footer-note">
        낭만주의 · 세븐나이츠 리버스 길드 사이트 — 길드전 · 공성전 · 파괴신을 한곳에서.
      </div>

      {/* 모바일 하단 탭바 */}
      <nav className="bottom-nav">
        {PRIMARY.map((r) => {
          const m = MENU.find((x) => x.route === r)!
          return (
            <button key={r} className={base === r ? 'active' : ''} onClick={() => navigate(r)}>
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

      {/* 더보기(관리) 시트 */}
      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="더보기 메뉴">
            <div className="sheet-handle" />
            {SECONDARY.map((r) => {
              const m = MENU.find((x) => x.route === r)!
              return (
                <button
                  key={r}
                  className={`sheet-item ${base === r ? 'active' : ''}`}
                  onClick={() => { navigate(r); setSheet(false) }}
                >
                  <Icon name={m.icon} className="ic" />
                  {fullLabel(m.label)}
                </button>
              )
            })}
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            {admin ? (
              <>
                {ADMIN_ITEMS.map((m) => (
                  <button
                    key={m.route}
                    className={`sheet-item ${base === m.route ? 'active' : ''}`}
                    onClick={() => { navigate(m.route); setSheet(false) }}
                  >
                    <Icon name={m.icon} className="ic" />
                    {fullLabel(m.label)}
                  </button>
                ))}
                <button className="sheet-item" onClick={() => { doLogout(); setSheet(false) }}>
                  <Icon name="lock" className="ic" />
                  관리자 로그아웃
                </button>
              </>
            ) : (
              <button
                className={`sheet-item ${base === 'admin' ? 'active' : ''}`}
                onClick={() => { navigate('admin'); setSheet(false) }}
              >
                <Icon name="lock" className="ic" />
                관리자 로그인
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
