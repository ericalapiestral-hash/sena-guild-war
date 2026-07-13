// 데이터 계층: 번들된 초기 데이터(JSON) + localStorage 사용자 데이터 오버레이.
// 나중에 공유 DB(Supabase 등)로 바꿀 때 이 파일만 교체하면 되도록 UI와 분리.

import { useSyncExternalStore } from 'react'
import type { CounterEntry, Hero, UserData } from './types'
import initialHeroes from './data/heroes.json'
import initialCounters from './data/counters.json'

const LS_KEY = 'sena-guild-war:v1'

const EMPTY: UserData = {
  customHeroes: [],
  counters: [],
  hiddenCounterIds: [],
  savedDecks: [],
  members: [],
  customGuides: [],
}

function load(): UserData {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return structuredClone(EMPTY)
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) }
  } catch {
    return structuredClone(EMPTY)
  }
}

let state: UserData = load()
const listeners = new Set<() => void>()

function persist() {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUserData(): UserData {
  return state
}

/** React 훅: 사용자 데이터 구독 */
export function useUserData(): UserData {
  return useSyncExternalStore(subscribe, getUserData)
}

export function update(mutator: (draft: UserData) => void) {
  const draft = structuredClone(state)
  mutator(draft)
  state = draft
  persist()
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
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
    state = { ...structuredClone(EMPTY), ...parsed }
    persist()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function resetAll() {
  state = structuredClone(EMPTY)
  persist()
}
