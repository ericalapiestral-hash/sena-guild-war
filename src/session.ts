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
  if (!p) return {}
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
    { token: string; name: string; mustChange?: boolean }
  write(TOKEN_KEY, j.token)
  write(NAME_KEY, j.name)
  return { mustChange: !!j.mustChange }
}

export async function changePassword(pw: string, next: string) {
  await post('/auth/password', { pw, next }, authHeaders())
}

// ---- 운영진 ----

export function setAdminPw(pw: string) { write(ADMIN_KEY, pw) }
export function clearAdminPw() { write(ADMIN_KEY, '') }

export type IdRow = { name: string; excluded: boolean; hasId: boolean; tmp: boolean; at: number | null }

export async function listIds(): Promise<{ on: boolean; members: IdRow[]; orphans: string[] }> {
  const r = await fetch(`${base()}/auth/list`, { method: 'POST', headers: adminHeaders() })
  return await unwrap(r) as { on: boolean; members: IdRow[]; orphans: string[] }
}

/** 아이디 발급 — 임시 비밀번호는 이때 한 번만 돌려받는다. 다시 볼 수 없다 */
export async function issueId(name: string): Promise<string> {
  const j = await post('/auth/issue', { name }, adminHeaders()) as { pw: string }
  return j.pw
}

export async function revokeIds(names: string[]) {
  await post('/auth/revoke', { names }, adminHeaders())
}

/** 로그인 검사를 켜고 끈다. 켜면 그 순간부터 아이디 없는 사람은 사이트를 못 연다 */
export async function setGate(on: boolean) {
  await post('/auth/enable', { on }, adminHeaders())
}
