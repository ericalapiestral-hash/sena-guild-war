// 관리자(운영진) 소프트 로그인 — 아이디 없이 비번만.
// 정적 사이트라 진짜 보안이 아니라 "관리 UI 감추기" 용도. 인증 상태는 이 브라우저 localStorage에 저장.
import { ADMIN_PW_HASH } from './data/config'

const KEY = 'sena-guild-war:admin'
export const ADMIN_ROUTES = ['search', 'members', 'settings']

export function isAdmin(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function login(pw: string): Promise<boolean> {
  const h = await sha256(pw)
  if (h === ADMIN_PW_HASH) {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* noop */
    }
    return true
  }
  return false
}
