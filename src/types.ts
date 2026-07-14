// 도메인 타입 정의
// 주의: 세나 리버스는 영웅별 속성(불/물/땅/빛/암) 시스템이 없음 — 속성은 요일 던전 분류 전용.

export type Position = '공격형' | '마법형' | '방어형' | '지원형' | '만능형'
export type Grade = '전설' | '희귀' | '고급' | '일반'

export interface Hero {
  id: string
  name: string
  grade: Grade
  position: Position | null
  role?: string
  pvpRelevant?: boolean | null
  /** 소속 그룹·특이사항 (세븐나이츠/사황/펜타곤/각성 형태 등) */
  tags?: string[]
  /** 사용자가 직접 추가한 영웅 여부 */
  custom?: boolean
}

/** 길드전 파티는 3인. 영웅 id 배열 (작성 중엔 미만 허용) */
export type DeckHeroes = string[]

export type Formation = '공격진형' | '밸런스진형' | '보호진형' | '기본진형'

export interface CounterDeck {
  heroes: DeckHeroes
  formation?: Formation
  /** 공략 포인트: 스킬 순서, 펫, 주의점 등 */
  notes: string
  /** 신뢰도: 검증됨(직접 승리) / 커뮤니티 / 추측 */
  confidence: '검증됨' | '커뮤니티' | '추측'
}

export interface CounterEntry {
  id: string
  /** 상대 방어덱 */
  defense: DeckHeroes
  defenseFormation?: Formation
  defenseNotes?: string
  counters: CounterDeck[]
  updatedAt: string
}

export interface SavedDeck {
  id: string
  name: string
  heroes: DeckHeroes
  memo?: string
  kind: '공격덱' | '방어덱'
  updatedAt: string
}

export interface BattleRecord {
  id: string
  date: string
  opponent?: string
  result: '승' | '패'
  memo?: string
}

export interface Member {
  id: string
  name: string
  /** 담당/메모: 주력덱, 담당 상대 등 */
  note?: string
  records: BattleRecord[]
}


export interface GuideSection {
  id: string
  title: string
  /** 마크다운 유사 문법 (간단 렌더러로 표시) */
  body: string
}

/** localStorage에 저장되는 사용자 데이터 전체 */
export interface UserData {
  customHeroes: Hero[]
  /** 초기 데이터 위에 덮어쓰는 카운터 엔트리 (id 충돌 시 사용자 버전 우선) */
  counters: CounterEntry[]
  /** 초기 카운터 중 숨김 처리한 id */
  hiddenCounterIds: string[]
  savedDecks: SavedDeck[]
  members: Member[]
  customGuides: GuideSection[]
}
