// 길드원 로그인.
//
// ★ 여기 있는 검사는 전부 '화면을 어디로 보낼까'를 정하는 용도다.
//   사이트는 정적 파일이라 코드가 통째로 공개된다. 누가 길드원인지는 워커만 판정한다.
//   (worker.js 의 guard() — 요청마다 명단을 다시 봐서, 나가면 그 즉시 끊긴다)
//
// 운영진 비밀번호는 예전엔 사이트 코드 안의 해시와 맞춰봤는데, 그건 감추기일 뿐이라
// 이제 워커 시크릿(ADMIN_PW)과 맞춘다. 사이트는 입력값을 들고 있다가 헤더로 보낼 뿐이다.
import { WORKER_URL } from './data/config'

const TOKEN_KEY = 'sena-guild-war:token'
const NAME_KEY = 'sena-guild-war:me'
const ADMIN_KEY = 'sena-guild-war:adminpw'
const STAFF_KEY = 'sena-guild-war:staff'
const SADMIN_KEY = 'sena-guild-war:siteadmin'

const base = () => WORKER_URL.replace(/\/+$/, '')

const read = (k: string): string => {
  try { return localStorage.getItem(k) ?? '' } catch { return '' }
}
const write = (k: string, v: string) => {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* noop */ }
}

export const getToken = () => read(TOKEN_KEY)
export const getMe = () => read(NAME_KEY)
export const getAdminPw = () => read(ADMIN_KEY)
export const isLoggedIn = () => !!getToken()

/**
 * 운영진(길드마스터·부길드마스터)인가.
 *
 * ★ 화면을 어떻게 그릴지 정하는 데만 쓴다. 여기 값을 손대도 실제로는 아무것도
 *   못 한다 — 워커가 요청마다 명단의 역할을 다시 보고 판정하기 때문이다.
 *   검사를 안 켠 동안(로그인 전)은 예전처럼 전부 열어둔다.
 */
export const isStaff = () => !isLoggedIn() || read(STAFF_KEY) === '1'

/**
 * 사이트 관리자인가 — 게임 안 직책과 별개로 지정한다.
 * 길드마스터가 바뀌어도 사이트를 관리하던 사람은 그대로 남는다.
 */
export const isSiteAdmin = () => read(SADMIN_KEY) === '1'

/** 워커에 보낼 인증 헤더. 토큰이 없으면 빈 객체 — 검사를 안 켠 동안은 그래도 통한다 */
export function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { authorization: `Bearer ${t}` } : {}
}
/**
 * 운영진 비번은 base64로 싸서 보낸다.
 *
 * HTTP 헤더에는 Latin-1 글자만 담을 수 있어서, 비번에 한글이 한 자라도 있으면
 * fetch가 요청을 만들다 그대로 터진다("String contains non ISO-8859-1 code point").
 * 서버에 닿지도 못하고 브라우저에는 'Failed to fetch' 로만 보여서 원인을 찾기 어렵다.
 */
export function adminHeaders(): Record<string, string> {
  const p = getAdminPw()
  // 비번을 안 넣어뒀으면 로그인 토큰으로 간다 — 사이트 관리자면 그것만으로 통한다.
  if (!p) return authHeaders()
  const bytes = new TextEncoder().encode(p)
  return { 'x-admin-pw': btoa(String.fromCharCode(...bytes)) }
}

// 워커가 로그인을 요구하면(401/403) 화면을 로그인으로 돌리기 위한 알림
type Listener = (reason: 'login' | 'gone') => void
const listeners = new Set<Listener>()
export function onAuthLost(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
/** store 의 pull/push 가 401·403 을 만나면 부른다 */
export function authLost(reason: 'login' | 'gone') {
  clearSession()
  for (const fn of listeners) fn(reason)
}

export function clearSession() {
  write(TOKEN_KEY, '')
  write(NAME_KEY, '')
  write(STAFF_KEY, '')
  write(SADMIN_KEY, '')
}

async function post(path: string, body: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body ?? {}),
  })
  return unwrap(r)
}

/**
 * 서버가 준 사유를 그대로 보여준다. 워커가 터지면(500) 본문이 JSON이 아니라
 * 사유가 없는데, 그때 '실패했어요'만 뜨면 원인을 못 찾는다 — 상태 코드라도 붙인다.
 */
async function unwrap(r: Response) {
  const j = await r.json().catch(() => null) as { error?: string } | null
  if (r.ok) return j ?? {}
  if (j?.error) throw new Error(j.error)
  throw new Error(
    r.status >= 500 ? `서버 오류 (${r.status}) — 워커 로그를 봐야 해요.`
      : `요청이 막혔어요 (${r.status}).`)
}

export async function login(name: string, pw: string): Promise<{ mustChange: boolean }> {
  const j = await post('/auth/login', { name: name.trim(), pw }) as
    { token: string; name: string; mustChange?: boolean; staff?: boolean; admin?: boolean }
  write(TOKEN_KEY, j.token)
  write(NAME_KEY, j.name)
  write(STAFF_KEY, j.staff ? '1' : '')
  write(SADMIN_KEY, j.admin ? '1' : '')
  return { mustChange: !!j.mustChange }
}

export async function changePassword(pw: string, next: string) {
  await post('/auth/password', { pw, next }, authHeaders())
}

// ---- 운영진 ----

export function setAdminPw(pw: string) { write(ADMIN_KEY, pw) }
export function clearAdminPw() { write(ADMIN_KEY, '') }

export type IdRow = {
  /** 길드원 고유 id — 닉이 바뀌어도 안 변한다. 발급·해제는 전부 이걸로 한다 */
  id: string
  name: string; excluded: boolean; role: string
  admin: boolean; staff: boolean
  hasId: boolean; tmp: boolean; at: number | null
}
export type IdList = { on: boolean; admins: string[]; members: IdRow[]; orphans: string[] }

export async function listIds(): Promise<IdList> {
  const r = await fetch(`${base()}/auth/list`, { method: 'POST', headers: adminHeaders() })
  return await unwrap(r) as IdList
}

/** 사이트 관리자 명단을 통째로 바꾼다 */
export async function setSiteAdmins(ids: string[]) {
  await post('/auth/admins', { ids }, adminHeaders())
}

/** 아이디 발급 — 임시 비밀번호는 이때 한 번만 돌려받는다. 다시 볼 수 없다 */
export async function issueId(id: string): Promise<string> {
  const j = await post('/auth/issue', { id }, adminHeaders()) as { pw: string }
  return j.pw
}

export async function revokeIds(ids: string[]) {
  await post('/auth/revoke', { ids }, adminHeaders())
}

/** 로그인 검사를 켜고 끈다. 켜면 그 순간부터 아이디 없는 사람은 사이트를 못 연다 */
export async function setGate(on: boolean) {
  await post('/auth/enable', { on }, adminHeaders())
}
