// 공성전·파괴신 통계에서 공통으로 쓰는 것들.
// 통계 페이지와 홈의 요약표가 같은 규칙(숫자 표기·등락·커트라인 판정)을 쓰도록 한곳에 모았다.
import type { CutlineGuide, Member, StatEntry, StatRound } from '../types'

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
export const todayWeekday = (): string => WEEKDAYS[(new Date().getDay() + 6) % 7]

export const fmt = (n?: number): string =>
  typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString() : '-'

/** 직전 기록 대비 등락(%) */
export function Delta({ prev, cur }: { prev?: number; cur?: number }) {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return <span className="muted">—</span>
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(pct) < 0.05) return <span className="delta">0%</span>
  const up = pct > 0
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

/** 집계 기준값 — 최종이 있으면 최종, 없으면 중간집계(파괴신 시즌 도중) */
export const effOf = (e: StatEntry, useMid: boolean): number | undefined =>
  typeof e.value === 'number' ? e.value : useMid ? e.mid : undefined

/**
 * 이 사람에게 적용되는 커트라인.
 *
 * 순서: 회차에 저장된 값 → [커트라인] 메뉴의 기준표 → 회차 기본값.
 *
 * 커트라인은 이제 [커트라인] 메뉴의 기준표 한 곳에서만 관리한다. 통계 화면의
 * 입력칸은 없앴다(등급이 늘면서 편집할 때마다 10칸 넘게 쌓였다).
 *
 * ★ 그래도 회차에 저장된 값을 먼저 본다. 지난 회차에는 그때 실제로 적용했던
 *   기준이 박혀 있는데, 지금 기준표로 덮으면 과거 미달 판정이 소급해서 바뀐다.
 *   기준표는 값이 없는 회차(=앞으로 만드는 회차)를 채우는 용도다.
 */
export function cutlineFor(
  round: StatRound,
  name: string,
  opts: { day?: string; tierOf?: Map<string, string>; guide?: CutlineGuide },
): number | undefined {
  if (opts.day) {
    const dc = round.dayCutlines?.[opts.day]
    if (typeof dc === 'number') return dc
    const gd = opts.guide?.siegeByDay?.[opts.day]
    if (typeof gd === 'number') return gd
    return round.cutline
  }
  const t = opts.tierOf?.get(name)
  const tc = t !== undefined ? round.tierCutlines?.[t] : undefined
  if (typeof tc === 'number') return tc
  const gt = t !== undefined ? opts.guide?.destroyerByTier?.[t] : undefined
  if (typeof gt === 'number') return gt
  return round.cutline
}

/** 마지막에 기록된 회차 (배열 끝) */
export const lastRound = (rounds: StatRound[]): StatRound | undefined => rounds[rounds.length - 1]

/**
 * 실제로 값이 들어 있는 가장 최근 회차와 그 위치.
 * 새 주차/시즌을 만들어 두고 아직 입력 전이면 그 회차는 비어 있으므로,
 * 홈 요약이 빈 표가 되지 않도록 한 단계씩 뒤로 물러난다.
 */
export function lastFilled(
  rounds: StatRound[],
  byDay: boolean,
): { round?: StatRound; index: number } {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i]
    const has = byDay
      ? Object.values(r.days ?? {}).some((l) => l.some((e) => typeof e.value === 'number'))
      : (r.entries ?? []).some((e) => typeof e.value === 'number' || typeof e.mid === 'number')
    if (has) return { round: r, index: i }
  }
  return { round: undefined, index: -1 }
}

/** 그 주차에서 점수가 들어간 가장 나중 요일 (월→일 순서 기준) */
export function latestDayWithData(round?: StatRound): string | undefined {
  if (!round?.days) return undefined
  for (let i = WEEKDAYS.length - 1; i >= 0; i--) {
    const d = WEEKDAYS[i]
    if ((round.days[d] ?? []).some((e) => typeof e.value === 'number')) return d
  }
  return undefined
}

/**
 * 표에서 이름 옆에 붙일 짧은 등급 표기 — '파이 11초' → '11초'.
 *
 * ★ 표시용으로만 쓴다. 저장값(Member.tier)과 커트라인 기준표(destroyerByTier)의
 *   키는 '파이 …' 그대로여야 한다. 여기서 자른 문자열로 기준표를 찾으면 안 된다.
 *   '파이'로 시작하지 않는 값은 건드리지 않고 그대로 둔다.
 */
export const tierShort = (t?: string): string => {
  const s = (t ?? '').trim()
  return s.startsWith('파이') ? s.slice(2).trim() : s
}

/** 길드원 이름 → 등급 (파괴신 등급별 커트라인용) */
export const tierMap = (members: Member[]): Map<string, string> =>
  new Map(members.filter((m) => m.tier).map((m) => [m.name, m.tier as string]))
