import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { navigate, useRoute } from './router'
import { Icon } from './components/Icon'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HomePage } from './pages/Home'
import { CutlinesPage } from './pages/Cutlines'
import { CountersPage } from './pages/Counters'
import { ArenaPage } from './pages/Arena'
import { HeroesPage } from './pages/Heroes'
import { GuidePage } from './pages/Guide'
import { StatsPage } from './pages/Stats'
import { MembersPage } from './pages/Members'
import { SettingsPage } from './pages/Settings'
import { WarDefensePage } from './pages/WarDefense'
import { AdminLogin } from './pages/AdminLogin'
import { ADMIN_ROUTES, isAdmin, logout } from './auth'

interface MenuItem {
  route: string
  label: string
  icon: string
  admin?: boolean
  /** 사이드바에서 이 항목 위에 그룹 제목을 넣는다 */
  group?: string
}

const MENU: MenuItem[] = [
  { route: 'home', label: '홈', icon: 'home' },
  { route: 'counters', label: '카운터덱', icon: 'target', group: '대전' },
  { route: 'arena', label: '결투장', icon: 'arena' },
  { route: 'heroes', label: '영웅 · 덱', icon: 'shield' },
  { route: 'guide', label: '가이드', icon: 'book' },
  { route: 'warattack', label: '길드전 공격', icon: 'target', group: '길드전 세팅' },
  { route: 'wardefense', label: '길드전 방어', icon: 'shield' },
  { route: 'siegeguide', label: '공성전 공략', icon: 'siege' },
  { route: 'raid', label: '원정대 배치', icon: 'destroyer' },
  { route: 'siege', label: '공성전', icon: 'siege', group: '길드 기록' },
  { route: 'destroyer', label: '파괴신', icon: 'destroyer' },
  { route: 'cutlines', label: '커트라인', icon: 'cutline' },
  { route: 'members', label: '길드원', icon: 'users', admin: true, group: '운영' },
  { route: 'settings', label: '데이터', icon: 'data', admin: true },
]

// 모바일 하단 탭은 5칸(4 + 더보기) — 자주 쓰는 대전 콘텐츠를 앞에 두고 나머지는 '더보기'로
const PRIMARY = ['home', 'counters', 'arena', 'heroes']
const SECONDARY = ['guide', 'warattack', 'wardefense', 'siegeguide', 'raid', 'siege', 'destroyer', 'cutlines']
const ADMIN_ITEMS = MENU.filter((m) => m.admin)
const fullLabel = (label: string) =>
  ({ 데이터: '데이터 관리', 길드원: '길드원 관리', 공성전: '공성전 통계', 파괴신: '파괴신 통계', 커트라인: '커트라인 기준', '원정대 배치': '강림 원정대 배치' } as Record<string, string>)[label] ?? label
const ROUTES = [...MENU.map((m) => m.route), 'admin']

const Brand = () => (
  <span className="logo">
    <span className="em" aria-hidden>⚔️</span>
    <span className="logo-t">낭만주의</span>
  </span>
)

type SideMode = 'full' | 'rail'
const SIDE_KEY = 'sena-guild-war:side'

/** 테마 — 자단(밝음) / 야청(어두움) */
type Theme = 'jadan' | 'yacheong'
const THEME_KEY = 'sena-guild-war:theme'
const THEME_LABEL: Record<Theme, string> = { jadan: '자단', yacheong: '야청' }

/**
 * 기기 설정을 따른다 — 라이트 모드면 자단, 다크 모드면 야청.
 * 사용자가 한 번 고르면 그 선택이 기기 설정을 이긴다.
 *
 * CSS도 같은 규칙(:root=자단 / @media dark=야청 / [data-theme=yacheong]=야청)을
 * 갖고 있어서 스크립트가 붙기 전 첫 페인트부터 올바른 테마로 그려진다.
 * 여기서는 '지금 적용된 테마'를 속성으로 확정해 아이콘·상단바 색을 맞춘다.
 */
function useTheme(): [Theme, () => void] {
  const [pref, setPref] = useState<Theme | null>(() => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'jadan' || v === 'yacheong' ? v : null
    } catch {
      return null
    }
  })
  const [sys, setSys] = useState<Theme>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'yacheong' : 'jadan',
  )

  // 고른 적이 없을 때만 기기 설정 변화를 따라간다
  useEffect(() => {
    if (pref) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSys(mql.matches ? 'yacheong' : 'jadan')
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [pref])

  const theme = pref ?? sys

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // 모바일 브라우저 상단 바 색까지 맞춘다
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'yacheong' ? '#15171a' : '#f8f5f4')
  }, [theme])

  const toggle = (): void => {
    const next: Theme = theme === 'jadan' ? 'yacheong' : 'jadan'
    setPref(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* 시크릿 모드 등 — 이번 세션에만 적용 */
    }
  }

  return [theme, toggle]
}

/**
 * 사이드바 펼침/접힘. 기본은 접힘(아이콘 레일) — 화면 폭과 무관하게 이 사이트의 기본값이다.
 * 사용자가 펼치면 그 선택을 계속 따른다.
 * CSS의 기본값도 레일이라, 스크립트가 붙기 전에 메뉴가 펼쳐졌다 접히는 깜빡임이 없다.
 */
function useSidebarMode(): [SideMode, () => void] {
  const [mode, setMode] = useState<SideMode>(() => {
    try {
      const v = localStorage.getItem(SIDE_KEY)
      return v === 'full' || v === 'rail' ? v : 'rail'
    } catch {
      return 'rail'
    }
  })

  // data-side를 DOM에 쓰는 일은 Sidebar가 맡는다 — 표시자 위치를 재기 '전에'
  // 속성이 적용돼야 해서, 측정하는 쪽과 같은 레이아웃 이펙트 안에서 처리한다.

  const toggle = (): void => {
    const next: SideMode = mode === 'full' ? 'rail' : 'full'
    setMode(next)
    try {
      localStorage.setItem(SIDE_KEY, next)
    } catch {
      /* 시크릿 모드 등 — 이번 세션에만 적용 */
    }
  }

  return [mode, toggle]
}

function AdminHome({ onLogout }: { onLogout: () => void }) {
  return (
    <div>
      <h1>관리자 메뉴</h1>
      <p className="page-desc">운영진 전용 페이지예요. 아래에서 이동하세요.</p>
      <div className="grid-2 stagger">
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

/**
 * 사이드바 — 활성 항목을 따라 미끄러지는 표시자.
 * 항목 사이에 그룹 제목이 끼어 높이가 일정하지 않아, 위치를 실측해 CSS 변수로 넘긴다.
 */
function Sidebar({
  items,
  active,
  admin,
  mode,
  theme,
  onToggleTheme,
  onToggle,
  onLogout,
}: {
  items: MenuItem[]
  active: string
  admin: boolean
  mode: SideMode
  theme: Theme
  onToggleTheme: () => void
  onToggle: () => void
  onLogout: () => void
}) {
  const navRef = useRef<HTMLElement | null>(null)
  const [ind, setInd] = useState<{ y: number; h: number } | null>(null)
  // 접힌 상태에서 아이콘에 커서를 올리면 나오는 이름표 (y = 항목의 세로 중심)
  const [flyout, setFlyout] = useState<{ y: number; label: string } | null>(null)

  // 접기/펼치기·페이지 이동으로 항목이 사라지면 이름표도 같이 거둔다
  useEffect(() => { setFlyout(null) }, [mode, active])

  /** 항목에 커서를 올렸을 때 이름표를 그 항목 높이에 맞춰 띄운다 */
  const showFlyout = (e: { currentTarget: HTMLElement }, label: string): void => {
    if (mode === 'full') return
    const r = e.currentTarget.getBoundingClientRect()
    setFlyout({ y: r.top + r.height / 2, label })
  }
  const hideFlyout = (): void => setFlyout(null)
  const flyoutProps = (label: string) => ({
    onMouseEnter: (e: { currentTarget: HTMLElement }) => showFlyout(e, label),
    onMouseLeave: hideFlyout,
    onFocus: (e: { currentTarget: HTMLElement }) => showFlyout(e, label),
    onBlur: hideFlyout,
  })

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    // ★ 접힘/펼침 속성을 먼저 반영한 뒤에 잰다.
    //   이 쓰기를 다른 이펙트에 두면(자식 이펙트가 부모보다 먼저 도는 탓에)
    //   그룹 제목이 나타나기 전 위치를 재게 되어 표시자가 엉뚱한 항목에 남는다.
    document.documentElement.dataset.side = mode
    const measure = (): void => {
      const el = nav.querySelector<HTMLElement>('.side-item.active')
      // 높이가 0이면 아직 레이아웃(또는 CSS)이 적용되기 전이라 표시자를 숨긴 채 다음 측정을 기다린다
      if (!el || el.offsetHeight === 0) { setInd(null); return }
      setInd((prev) =>
        prev && prev.y === el.offsetTop && prev.h === el.offsetHeight ? prev : { y: el.offsetTop, h: el.offsetHeight },
      )
    }
    measure()
    // 스타일·폰트가 늦게 적용되거나 접기/펼치기로 폭이 바뀔 때
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    // ★ 사이드바가 display:none(모바일 폭)에서 다시 보이게 될 때는 ResizeObserver가
    //   울리지 않는다. 창을 좁게 열었다 넓히면 표시자가 안 뜨므로 resize도 함께 듣는다.
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
    // 접기/펼치기로 항목 높이가 달라질 수 있어 mode도 의존성에 넣는다
  }, [active, items.length, mode])

  return (
    <aside className="sidebar">
      <button className="side-brand" onClick={() => navigate('home')} aria-label="홈으로">
        <Brand />
      </button>

      <nav className="side-nav" ref={navRef} aria-label="주 메뉴">
        {ind && (
          <span
            className="side-ind"
            // --ind-h: 접힌 상태에서 폭을 높이와 같게 잡아 정사각형으로 만들 때 쓴다
            style={{ transform: `translateY(${ind.y}px)`, height: ind.h, ['--ind-h' as string]: `${ind.h}px` }}
            aria-hidden
          />
        )}
        {items.map((m) => (
          <div key={m.route} className="side-slot">
            {m.group && <div className="side-group">{m.group}</div>}
            <button
              className={`side-item ${active === m.route ? 'active' : ''}`}
              aria-current={active === m.route ? 'page' : undefined}
              // 접힌 상태에선 라벨 폭이 0이라 이름이 비어 보인다 — 이름은 aria-label이 책임진다
              aria-label={m.label}
              onClick={() => navigate(m.route)}
              {...flyoutProps(m.label)}
            >
              <Icon name={m.icon} className="ic" />
              <span className="side-label">{m.label}</span>
            </button>
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <button
          className="side-item side-theme"
          onClick={onToggleTheme}
          aria-label={`화면 ${THEME_LABEL[theme]} — 눌러서 ${THEME_LABEL[theme === 'jadan' ? 'yacheong' : 'jadan']}으로`}
          {...flyoutProps(`${THEME_LABEL[theme]} → ${THEME_LABEL[theme === 'jadan' ? 'yacheong' : 'jadan']}`)}
        >
          <Icon name="theme" className="ic" />
          <span className="side-label">{THEME_LABEL[theme]}</span>
        </button>
        <button
          className="side-item side-toggle"
          onClick={onToggle}
          aria-label={mode === 'full' ? '메뉴 접기' : '메뉴 펼치기'}
          aria-expanded={mode === 'full'}
          {...flyoutProps(mode === 'full' ? '메뉴 접기' : '메뉴 펼치기')}
        >
          <Icon name="collapse" className="ic" />
          <span className="side-label">메뉴 접기</span>
        </button>
        {admin ? (
          <button className="side-item side-lock" onClick={onLogout} aria-label="관리자 로그아웃" {...flyoutProps('관리자 로그아웃')}>
            <Icon name="lock" className="ic" />
            <span className="side-label">로그아웃</span>
          </button>
        ) : (
          <button
            className={`side-item side-lock ${active === 'admin' ? 'active' : ''}`}
            onClick={() => navigate('admin')}
            aria-label="관리자 로그인"
            {...flyoutProps('관리자 로그인')}
          >
            <Icon name="lock" className="ic" />
            <span className="side-label">관리자</span>
          </button>
        )}
      </div>

      {/* 이름표는 사이드바 안이 아니라 밖에 둔다 — .side-nav의 세로 스크롤에 가로로 잘리지 않게 */}
      <span className={`side-flyout ${flyout ? 'on' : ''}`} style={{ ['--fy' as string]: `${flyout?.y ?? 0}px` }} aria-hidden>
        {flyout?.label ?? ''}
      </span>
    </aside>
  )
}

export default function App() {
  const route = useRoute()
  const base = route.split('/')[0]
  const [sheet, setSheet] = useState(false)
  const [admin, setAdmin] = useState(isAdmin())
  const [sideMode, toggleSide] = useSidebarMode()
  const [theme, toggleTheme] = useTheme()

  const visible = MENU.filter((m) => !m.admin || admin)
  const adminActive = ADMIN_ITEMS.some((m) => m.route === base) || base === 'admin'
  const moreActive = adminActive || SECONDARY.includes(base)
  const needLogin = (ADMIN_ROUTES.includes(base) || base === 'admin') && !admin
  const primaryIndex = PRIMARY.indexOf(base)

  // 페이지를 옮기면 맨 위에서 시작 — 긴 목록을 보다 이동했을 때 중간에 떨어지지 않게
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }, [base])

  function doLogout() {
    logout()
    setAdmin(false)
    navigate('home')
  }

  return (
    <>
      <Sidebar
        items={visible}
        active={base}
        admin={admin}
        mode={sideMode}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggle={toggleSide}
        onLogout={doLogout}
      />

      {/* 모바일 상단 앱바 */}
      <header className="mobile-appbar">
        <Brand />
      </header>

      <main>
        {/* key={base}: 오류가 나도 다른 페이지로 이동하면 오류 상태가 풀리고, 전환 애니메이션도 다시 돈다 */}
        <ErrorBoundary key={base}>
          <div className="page" key={route}>
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
                {base === 'arena' && <ArenaPage sub={route.split('/')[1] || 'normal'} />}
                {base === 'heroes' && <HeroesPage />}
                {base === 'guide' && <GuidePage />}
                {base === 'siege' && <StatsPage kind="siege" />}
                {base === 'destroyer' && <StatsPage kind="destroyer" />}
                {base === 'cutlines' && <CutlinesPage />}
                {base === 'wardefense' && <WarDefensePage />}
                {base === 'members' && <MembersPage />}
                {base === 'settings' && <SettingsPage />}
                {base === 'admin' && admin && <AdminHome onLogout={doLogout} />}
                {!ROUTES.includes(base) && <HomePage />}
              </>
            )}
          </div>
        </ErrorBoundary>
      </main>

      <div className="footer-note">
        낭만주의 · 세븐나이츠 리버스 길드 사이트 — 길드전 · 결투장 · 공성전 · 파괴신을 한곳에서.
      </div>

      {/* 모바일 하단 탭바 */}
      <nav className="bottom-nav" style={{ ['--i' as string]: primaryIndex < 0 ? 4 : primaryIndex }}>
        {primaryIndex >= 0 && <span className="bn-ind" aria-hidden />}
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

      {/* 더보기 시트 */}
      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="더보기 메뉴">
            <div className="sheet-handle" />
            <div className="stagger">
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
              <div className="sheet-sep" />
              <button className="sheet-item" onClick={toggleTheme}>
                <Icon name="theme" className="ic" />
                화면 · <b>{THEME_LABEL[theme]}</b>
                <em className="sheet-hint">눌러서 {THEME_LABEL[theme === 'jadan' ? 'yacheong' : 'jadan']}으로</em>
              </button>
              <div className="sheet-sep" />
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
          </div>
        </>
      )}
    </>
  )
}
