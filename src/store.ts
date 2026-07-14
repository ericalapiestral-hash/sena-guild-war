// 데이터 계층: 번들된 초기 데이터(JSON) + 사용자/공유 데이터 오버레이.
// 공유 모드: 워커(KV)가 연결되면 길드 공유 데이터를 받아오고, 관리자 편집은 워커로 자동 업로드.
// 로컬 모드: 워커 미연결 시 각자 브라우저(localStorage)에만 저장(기존 동작).

import { useSyncExternalStore } from 'react'
import type { CounterDeck, CounterEntry, CounterHeroSlot, Hero, UserData } from './types'
import initialHeroes from './data/heroes.json'
import initialCounters from './data/counters.json'
import { WORKER_URL } from './data/config'

const LS_KEY = 'sena-guild-war:v1'
const SEARCH_CFG = 'sena-guild-war:search-config'
const REV_KEY = 'sena-guild-war:rev'

const EMPTY: UserData = {
  customHeroes: [],
  counters: [],
  hiddenCounterIds: [],
  savedDecks: [],
  members: [],
  customGuides: [],
  siegeRounds: [],
  destroyerRounds: [],
}

const ARRAY_FIELDS = Object.keys(EMPTY) as (keyof UserData)[]

/** 외부에서 온 데이터(공유 pull·localStorage·가져오기)를 안전한 형태로 정규화.
 *  배열이어야 할 필드가 다른 타입이면 버림 — 오염된 공유 데이터 하나로
 *  전 길드원 화면이 깨지는 것 방지. (워커도 같은 검증을 하지만 이중 방어) */
function normalize(raw: unknown): UserData {
  const base = structuredClone(EMPTY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const src = raw as Record<string, unknown>
  for (const k of ARRAY_FIELDS) {
    if (Array.isArray(src[k])) (base as unknown as Record<string, unknown>)[k] = src[k]
  }
  return base
}

function load(): UserData {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return structuredClone(EMPTY)
    return normalize(JSON.parse(raw))
  } catch {
    return structuredClone(EMPTY)
  }
}

/** 오늘 날짜 YYYY-MM-DD — 로컬 시간대 기준 (toISOString은 UTC라 오전 9시 전엔 하루 전으로 찍힘) */
export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let state: UserData = load()
const listeners = new Set<() => void>()

function persistLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l())
}

// ---- 공유 저장소(워커 KV) 연동 ----

function searchCfg(): { workerUrl?: string; password?: string } {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_CFG) || '{}')
  } catch {
    return {}
  }
}

function readBase(): string {
  const url = WORKER_URL || String(searchCfg().workerUrl || '')
  return url.replace(/\/+$/, '')
}

/** 공유 저장소가 연결된 상태인지 (워커 URL 존재) */
export function sharedMode(): boolean {
  return !!readBase()
}

/** 편집(등록/수정/삭제) 가능 여부: 길드원 누구나 덱·가이드 편집 가능(공개).
 *  (관리자 전용 페이지 접근은 별개 — auth.isAdmin) */
export function canEdit(): boolean {
  return true
}

// 편집 버전(타임스탬프). KV는 최종 일관성이라 방금 저장한 것보다 오래된 데이터가
// 읽힐 수 있음 — 버전을 비교해 "내 최신 편집보다 오래된 pull"이 입력을 덮어쓰지 않게 함.
let rev = 0
try {
  rev = Number(localStorage.getItem(REV_KEY) || 0) || 0
} catch {
  /* noop */
}
// 과거에 조작된 미래 시각 rev가 저장돼 있으면 동기화가 영영 얼어붙음 — 해제
if (rev > Date.now() + 60 * 60 * 1000) rev = 0

function saveRev(v: number) {
  rev = v
  try {
    localStorage.setItem(REV_KEY, String(v))
  } catch {
    /* noop */
  }
}

async function pull() {
  const base = readBase()
  if (!base) return
  try {
    const r = await fetch(`${base}/data`, { cache: 'no-store' })
    if (!r.ok) return
    const data = await r.json()
    if (data && typeof data === 'object' && Object.keys(data).length) {
      let incRev = Number(data._rev || 0) || 0
      // 미래 시각으로 조작된 rev 방어 — 그대로 저장하면 이후 모든 pull이 무시됨
      if (incRev > Date.now() + 60 * 60 * 1000) incRev = Date.now()
      // 내 최신 편집(rev)보다 오래되거나 같은 버전이면 무시 — 입력 중 덮어쓰기 방지
      if (rev && incRev <= rev) return
      state = normalize(data)
      if (incRev) saveRev(incRev)
      persistLocal()
    }
  } catch {
    /* 오프라인: 로컬 캐시 유지 */
  }
}

let pushTimer: number | undefined

/** 잦은 입력(키 입력마다)을 1.2초로 몰아서 한 번만 업로드 */
function schedulePush() {
  if (!readBase()) return
  if (pushTimer !== undefined) window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => {
    pushTimer = undefined
    void push()
  }, 1200)
}

async function push(keepalive = false) {
  const base = readBase()
  if (!base) return
  saveRev(Math.max(Date.now(), rev + 1))
  // 덱·가이드 편집은 공개(비번 없음) — 워커가 /data POST를 누구나 허용.
  try {
    const r = await fetch(`${base}/data`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { ...state, _rev: rev } }),
      keepalive,
    })
    // 워커가 서버 시각으로 스탬프한 최종 rev를 돌려줌 — 클라이언트 시계 오차와
    // 무관하게 모두가 한 시계(서버)를 기준으로 버전 비교하도록 맞춤
    if (r.ok) {
      const j = (await r.json().catch(() => null)) as { rev?: number } | null
      if (j && typeof j.rev === 'number' && j.rev > 0) saveRev(j.rev)
    }
  } catch {
    /* noop */
  }
}

// 최초 로드 시 공유 데이터를 당겨오고, 이후 주기적으로 동기화
// (백그라운드 탭은 건너뜀 — KV 무료 한도 절약. 탭으로 돌아오면 즉시 갱신)
if (typeof window !== 'undefined') {
  pull()
  window.setInterval(() => {
    if (!document.hidden) pull()
  }, 60000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pull()
  })
  // 탭을 닫을 때 아직 안 올라간 입력이 있으면 마지막으로 전송
  window.addEventListener('beforeunload', () => {
    if (pushTimer !== undefined) {
      window.clearTimeout(pushTimer)
      pushTimer = undefined
      void push(true)
    }
  })
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUserData(): UserData {
  return state
}

/** React 훅: 사용자/공유 데이터 구독 */
export function useUserData(): UserData {
  return useSyncExternalStore(subscribe, getUserData)
}

export function update(mutator: (draft: UserData) => void) {
  const draft = structuredClone(state)
  mutator(draft)
  state = draft
  persistLocal()
  schedulePush()
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// ---- 카운터 영웅 슬롯 헬퍼 (구버전 문자열 ↔ 상세 슬롯 호환) ----

export function slotName(h: string | CounterHeroSlot): string {
  return typeof h === 'string' ? h : h.name
}

export function toSlot(h: string | CounterHeroSlot): CounterHeroSlot {
  return typeof h === 'string' ? { name: h } : { ...h }
}

/** 카운터덱의 영웅 이름 목록 (검색·매칭용) */
export function counterHeroNames(c: CounterDeck): string[] {
  return (c.heroes || []).map(slotName)
}

// ---- 병합된 뷰 (초기 데이터 + 사용자 데이터) ----

export function getAllHeroes(): Hero[] {
  return [...(initialHeroes as Hero[]), ...state.customHeroes]
}

export function getAllCounters(): CounterEntry[] {
  const userIds = new Set(state.counters.map((c) => c.id))
  const hidden = new Set(state.hiddenCounterIds)
  const base = (initialCounters as CounterEntry[]).filter(
    (c) => !userIds.has(c.id) && !hidden.has(c.id),
  )
  return [...state.counters, ...base]
}

/** 초기 데이터에 포함된 엔트리인지 (사용자 수정본 제외) */
export function isBuiltinCounter(id: string): boolean {
  return (initialCounters as CounterEntry[]).some((c) => c.id === id)
}

// ---- 내보내기 / 가져오기 ----

export function exportJson(): string {
  return JSON.stringify(state, null, 2)
}

export function importJson(raw: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('형식이 올바르지 않음')
    state = normalize(parsed)
    persistLocal()
    void push()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function resetAll() {
  state = structuredClone(EMPTY)
  persistLocal()
  void push()
}
