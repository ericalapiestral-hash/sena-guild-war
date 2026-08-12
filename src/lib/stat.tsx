// 공성전·파괴신 통계에서 공통으로 쓰는 것들.
// 통계 페이지와 홈의 요약표가 같은 규칙(숫자 표기·등락·커트라인 판정)을 쓰도록 한곳에 모았다.
import type { Member, StatEntry, StatRound } from '../types'

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
 * 파괴신은 길드원 등급(초월 단계)별 값이 있으면 그것, 없으면 회차 기본값.
 * 공성전은 요일별 값이 있으면 그것, 없으면 회차 기본값.
 */
export function cutlineFor(
  round: StatRound,
  name: string,
  opts: { day?: string; tierOf?: Map<string, string> },
): number | undefined {
  if (opts.day) {
    const dc = round.dayCutlines?.[opts.day]
    return typeof dc === 'number' ? dc : round.cutline
  }
  const t = opts.tierOf?.get(name)
  const tc = t !== undefined ? round.tierCutlines?.[t] : undefined
  return typeof tc === 'number' ? tc : round.cutline
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

/** 길드원 이름 → 등급 (파괴신 등급별 커트라인용) */
export const tierMap = (members: Member[]): Map<string, string> =>
  new Map(members.filter((m) => m.tier).map((m) => [m.name, m.tier as string]))
