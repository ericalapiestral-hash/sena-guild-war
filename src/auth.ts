// 관리자(운영진) 소프트 로그인 — 아이디 없이 비번만.
// 정적 사이트라 이건 "관리 UI 를 감추는" 장치일 뿐이다. 진짜 판정은 워커가 한다.
//
// ★ 예전엔 사이트 코드에 박아 둔 SHA-256 해시와 맞춰봤다. 번들이 공개되니 해시도
//   공개고, 솔트가 없어 오프라인으로 깨면 끝이었다. 지금은 워커에 실제로 물어본다
//   (틀린 비번은 워커가 403 을 준다). 비번은 이 탭 메모리에만 남는다.
import { WORKER_URL } from './data/config'
import { clearAdminPw, listIds, setAdminPw } from './session'

const KEY = 'sena-guild-war:admin'
export const ADMIN_ROUTES = ['members', 'settings']

export function isAdmin(): boolean {
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
