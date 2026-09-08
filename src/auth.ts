// 운영 메뉴([길드원]·[데이터])를 보여줄지 정한다.
//
// ★ 예전엔 여기 '관리자 비밀번호' 로그인이 따로 있었다. 없앴다.
//   비번을 두 번 받을 이유가 없다 — 누가 관리자인지는 워커가 길드원 로그인 때
//   이미 판정해서 내려준다(session 의 isSiteAdmin). 게다가 그 두 번째 비번이
//   워커 시크릿과 어긋나면 자기 사이트에서 잠겼다.
//
//   정적 사이트라 이 판정은 '화면을 어떻게 그릴까'용일 뿐이다. 실제 차단은
//   워커가 요청마다 한다(worker.js 의 guard / handleAuth 관문).
import { clearAdminPw, isLoggedIn, isSiteAdmin } from './session'

/** 운영진 전용 화면 */
export const ADMIN_ROUTES = ['members', 'settings']

/**
 * 운영 메뉴를 열어 줄 사람인가.
 *
 * 로그인 검사를 아직 안 켠 동안(로그인 자체가 없는 상태)은 열어 둔다 —
 * 그때는 워커도 전부 통과시키므로 감춰봐야 의미가 없고, 무엇보다 아이디를
 * 나눠주려면 [길드원] 화면에 들어갈 수 있어야 한다. 검사를 켠 뒤로는
 * 사이트 관리자만 보인다. (isStaff 와 같은 규칙)
 */
export const isAdmin = (): boolean => !isLoggedIn() || isSiteAdmin()

/** 남은 뒷정리 — 메모리에 든 워커 비번을 턴다 */
export function logout(): void {
  clearAdminPw()
}
