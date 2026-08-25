// 길드전·공성전 세팅에서 쓰는 고정 목록.
// 게임에 정해져 있는 값이라 사용자가 늘릴 일이 없어 코드에 둔다.
// (영웅·카운터덱처럼 계속 늘어나는 건 JSON + 공유 저장소로 간다)

/** 장비 세트 */
export const GEAR_SETS = [
  '선봉장', '추적자', '성기사', '수문장', '수호자', '암살자', '복수자', '주술사', '조율자',
] as const

/** 장신구(반지) 계열 */
export const ACCESSORIES = [
  '불사', '권능', '부활', '상태이상', '출혈&화상', '토벌&공성',
] as const

/** 무기 주옵션 */
export const WEAPON_OPTIONS = [
  '약점 공격 확률', '치명타 확률', '치명타 피해', '모든 공격력(%)', '효과 적중', '방어력(%)', '생명력(%)',
] as const

/** 방어구 주옵션 */
export const ARMOR_OPTIONS = [
  '받는 피해 감소', '막기 확률', '모든 공격력(%)', '방어력(%)', '생명력(%)', '효과 저항',
] as const

/** 공성전 요일별 보스 — 요일이 고정이라 표처럼 쓴다 */
export const SIEGE_BOSSES: Array<{ day: string; boss: string; type: string }> = [
  { day: '월', boss: '루디', type: '마법' },
  { day: '화', boss: '아일린', type: '마법' },
  { day: '수', boss: '레이첼', type: '마법' },
  { day: '목', boss: '델론즈', type: '물리' },
  { day: '금', boss: '제이브', type: '물리' },
  { day: '토', boss: '스파이크', type: '물리' },
  { day: '일', boss: '크리스', type: '단일' },
]

export const bossOf = (day: string) => SIEGE_BOSSES.find((b) => b.day === day)

/** 강림 원정대 단계 (파괴신) */
export const RAID_STAGES = [
  '파괴의 그림자 태오',
  '파괴의 그림자 연희',
  '파괴의 그림자 카일',
  '파괴의 그림자 카르마',
  '최종 파괴신',
] as const

/** 한 단계에 배치할 수 있는 인원 */
export const RAID_SLOTS = 10
/** 길드전은 3v3 */
export const WAR_DECK_SIZE = 3
/** 공성전 편성 인원 */
export const SIEGE_DECK_SIZE = 5

/** 방어 세팅 타입 */
export const DEFENSE_STYLES = ['속공', '내실'] as const
