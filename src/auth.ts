// 관리자(운영진) 소프트 로그인 — 아이디 없이 비번만.
// 정적 사이트라 이건 "관리 UI 를 감추는" 장치일 뿐이다. 진짜 판정은 워커가 한다.
//
// ★ 예전엔 사이트 코드에 박아 둔 SHA-256 해시와 맞춰봤다. 번들이 공개되니 해시도
//   공개고, 솔트가 없어 오프라인으로 깨면 끝이었다. 지금은 워커에 실제로 물어본다
//   (틀린 비번은 워커가 403 을 준다). 비번은 이 탭 메모리에만 남는다.
import { WORKER_URL } from './data/config'
import { clearAdminPw, isSiteAdmin, listIds, setAdminPw } from './session'

const KEY = 'sena-guild-war:admin'
export const ADMIN_ROUTES = ['members', 'settings']

export function isAdmin(): boolean {
  // ★ 사이트 관리자로 로그인해 있으면 그것만으로 연다.
  //
  //   워커가 로그인할 때 이미 '이 사람은 사이트 관리자'라고 판정해서 내려준 값이다
  //   (session 의 SADMIN_KEY). 그런데 여기서 그걸 안 보고 옛 비번 플래그만 봐서,
  //   영구 관리자로 로그인해도 [길드원]·[데이터] 메뉴가 안 떴다. 비번을 또 치게
  //   하면 그 비번이 워커 시크릿과 다를 때 자기 사이트에서 잠긴다.
  if (isSiteAdmin()) return true
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function logout(): void {
  clearAdminPw()
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

function mark() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* noop */
  }
}

export async function login(pw: string): Promise<boolean> {
  // 로컬 모드(워커 미연결)에는 공유 데이터 자체가 없어 감출 것도 없다
  if (!WORKER_URL) {
    mark()
    return true
  }
  setAdminPw(pw)
  try {
    await listIds()          // 워커가 ADMIN_PW 와 맞춰본다
    mark()
    return true
  } catch {
    clearAdminPw()
    return false
  }
}
