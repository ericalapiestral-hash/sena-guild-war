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

/** 카운터 영웅 1인의 상세 세팅 (배치·반지·장비·스탯) */
export interface CounterHeroSlot {
  /** 영웅 이름 (heroes.json id와 매칭되면 유형 표시) */
  name: string
  /** 전방/후방/각성 등 배치 라벨 (선택) */
  place?: string
  /** 반지(장신구) 추천 */
  ring?: string
  /** 장비 추천 (여러 줄 가능) */
  gear?: string
  /** 추가 스탯 한 줄 (극속공·막기최대 등) */
  stat?: string
}

export interface CounterDeck {
  /** 덱 별명 (예: 프목실, 밀멜스) */
  name?: string
  /** 추천도 0~10 */
  rating?: number
  /** 카운터 영웅 — 문자열(구버전) 또는 상세 슬롯 */
  heroes: Array<string | CounterHeroSlot>
  /** 진형 (자유 텍스트, 예 '보호진형(멜키르)') */
  formation?: string
  /** 펫 */
  pet?: string
  /** 추천 속공순서 (여러 줄 가능) */
  speedOrder?: string
  /** 추천 카운터 팀속공 */
  teamSpeed?: string
  /** 추천 카운터 스킬순서 */
  skillOrder?: string
  /** 공략 포인트 / 그외 참고사항 */
  notes: string
  /** 신뢰도: 검증됨(직접 승리) / 커뮤니티 / 추측 */
  confidence: '검증됨' | '커뮤니티' | '추측'
  /** 최근 수정일 (선택) */
  updatedAt?: string
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

/** 길드 내 역할 (기본=멤버) */
export type MemberRole = '길드마스터' | '부길드마스터' | '정예멤버' | '멤버'

export interface Member {
  id: string
  name: string
  /** 길드 내 역할 (미지정=멤버) */
  role?: MemberRole
  /** 부계정 여부 (true일 때만 '부계정' 표시) */
  isAlt?: boolean
  /**
   * 외부 처리 — 지금 길드에 없는 계정. 명단(roster)에서 빠져 통계·커트라인
   * 집계 대상이 아니게 된다. 자리 때문에 들락날락하는 계정을 삭제하지 않고
   * 잠시 내려두는 용도라, 승패 기록과 지난 회차 점수는 그대로 남는다.
   */
  excluded?: boolean
  /** 파괴신 등급 (영웅 초월 단계 등, 예: '파이 3초월') — 시즌별 등급 커트라인 적용에 사용 */
  tier?: string
  /** 계정 주인 이름 (부계정의 본주인 등, 설정 시에만 표시) */
  owner?: string
  /** 담당/메모: 주력덱, 담당 상대 등 */
  note?: string
  records: BattleRecord[]
}

/** 공성전/파괴신 통계 — 회차 안의 길드원 1명 기록 */
export interface StatEntry {
  name: string
  /** 공성전=점수 / 파괴신=이번 시즌 최종 딜량 */
  value?: number
  /** 파괴신 중간집계 (시즌 도중 기록) */
  mid?: number
  /** 참여 여부 */
  joined?: boolean
  memo?: string
}

/** 통계 한 회차(파괴신=시즌) / 한 주차(공성전=주) */
export interface StatRound {
  id: string
  /** 예: '1회차', '7월 2주', '시즌 12' */
  label: string
  /** 기록일 YYYY-MM-DD */
  date?: string
  /** 단일 기록 (파괴신 등 회차별) */
  entries: StatEntry[]
  /** 요일별 기록 (공성전) — 키: '월'|'화'|'수'|'목'|'금'|'토'|'일' */
  days?: Record<string, StatEntry[]>
  /** 커트라인 — 이 값 이하는 '미달'. 회차 전체 기본값(파괴신은 이 값만 사용) */
  cutline?: number
  /** 요일별 커트라인 (공성전 — 요일마다 기준점이 달라 개별 설정). 특정 요일이 비어있으면 cutline을 기본값으로 사용 */
  dayCutlines?: Record<string, number>
  /** 등급별 커트라인 (파괴신 — 영웅 초월 단계마다 기준이 달라 개별 설정). 키: Member.tier. 없으면 cutline을 기본값으로 사용 */
  tierCutlines?: Record<string, number>
}


export interface GuideSection {
  id: string
  title: string
  /** 마크다운 유사 문법 (간단 렌더러로 표시) */
  body: string
}

// ---- 결투장 ----
// 길드전(3인)과 달리 결투장은 5인 편성이고, 모드마다 규칙이 다르다.
//  normal 일반 결투장 — 점수 경쟁. 공덱/방덱/마덱 중 하나를 방어로 걸어둔다.
//  high   상급 결투장 — 일반과 편성은 같지만 상위 구간 메타(속공 마덱 위주).
//  live   실시간 결투장 — 덱 3개를 준비해 밴픽 후 실시간 대전. 편성보다 운영이 핵심.

export type ArenaMode = 'normal' | 'high' | 'live'

/** 덱 성격. '운영'은 실시간 결투장의 밴픽·플랜처럼 편성이 고정되지 않은 글 */
export type ArenaDeckKind = '공덱' | '방덱' | '마덱' | '운영'

/** 결투장 편성 1인 — 속공 순위와 템/반지/전용장비 */
export interface ArenaHeroSlot {
  /** 영웅 이름 (heroes.json id와 매칭되면 유형 표시) */
  name: string
  /** 속공 순위 1~5 (1이 제일 빠름) */
  speed?: number
  /** 장비 세트 (예: 추적자 약치공공) */
  gear?: string
  /** 반지·장신구 (예: 6부6권) */
  ring?: string
  /** 전용장비 (예: 4파쇄) */
  exclusive?: string
  /** 그 외 스탯 한 줄 (효적 100 필수 등) */
  stat?: string
}

export interface ArenaEntry {
  id: string
  mode: ArenaMode
  kind: ArenaDeckKind
  /** 덱 이름 (예: 속딸겔두, 오델선 공덱, 프연프 마덱) */
  name: string
  heroes: ArenaHeroSlot[]
  formation?: string
  /** 스킬 순서 (예: 프2 멜2 레2 / 프연프) */
  skillOrder?: string
  /** 달성 점수·랭킹 (예: '7100점 마감', '상결 4위') — 신뢰도 가늠용 */
  score?: string
  /** 한 줄 요약 */
  summary?: string
  /** 주의점·상성 등 (한 줄씩) */
  tips?: string[]
  /** 출처 (예: 디시 공략/정보, 공식 라운지) */
  source?: string
  sourceUrl?: string
  updatedAt: string
}

/** localStorage에 저장되는 사용자 데이터 전체 */
/** 기준 커트라인 — 회차마다 넣는 값과 별개로, 상시 참고하는 기준표.
 *  파괴신은 파이 초월 단계별(키: Member.tier와 같은 '파이 6초' 표기), 공성전은 요일별. */
export interface CutlineGuide {
  destroyerByTier: Record<string, number>
  /** 키: 월~일 */
  siegeByDay: Record<string, number>
  /** 자유 메모 (예: 적용 기준·면제 조건) */
  memo?: string
}

// ---- 길드전·공성전 세팅 (세나링크 허브 구조 참고, 2026-08-25) ----
// 네 화면(길드전 공격·방어, 공성전 공략, 원정대 배치)이 '영웅 1인 세팅'을 공유한다.

/** 영웅 1인의 장비 세팅 — 기존 CounterHeroSlot보다 항목이 잘게 나뉜다 */
export interface LoadoutSlot {
  /** 영웅 이름 (heroes.json과 매칭되면 유형 표시) */
  name: string
  /** 장비 세트 (GEAR_SETS) */
  set?: string
  /** 무기1 주옵 (WEAPON_OPTIONS) */
  weapon1?: string
  /** 방어구1 주옵 (ARMOR_OPTIONS) */
  armor1?: string
  /** 무기2 주옵 */
  weapon2?: string
  /** 방어구2 주옵 */
  armor2?: string
  /** 장신구 (ACCESSORIES) */
  accessory?: string
  /** 그 외 한 줄 (속공 수치·전용장비 등) */
  stat?: string
}

/** 길드전 방어 세팅 (3v3) */
export interface DefenseSetup {
  id: string
  /** 방어 덱 이름 */
  name: string
  /** 추천도 ★1~5 */
  tier?: number
  /** 속공 세팅 / 내실 세팅 */
  style?: string
  /** 최대 3인 */
  heroes: LoadoutSlot[]
  formation?: string
  pet?: string
  /** 스킬 예약 순서 */
  skillOrder?: string
  /** 속공 수치 조건 — 이상 ~ 이하 */
  speedMin?: number
  speedMax?: number
  /** 부옵·장비 우선순위 요약 */
  subStats?: string
  /** 장신구 요약 */
  accessoryNote?: string
  /** 기타 디테일 */
  notes?: string
  updatedAt: string
}

/** 길드전 공격 — 상대 덱 하나와 그에 대한 우리 공략들 */
export interface AttackDeck {
  name?: string
  heroes: LoadoutSlot[]
  formation?: string
  pet?: string
  speedOrder?: string
  skillOrder?: string
  notes?: string
}
export interface AttackTarget {
  id: string
  /** 상대 덱 제목 */
  name: string
  /** 상대 3인 */
  enemy: string[]
  /** 특이사항 */
  note?: string
  /** 우리 공략 */
  decks: AttackDeck[]
  updatedAt: string
}

/** 공성전 요일 보스 공략 (5인) */
export interface SiegeGuide {
  id: string
  /** 월~일 — 보스는 SIEGE_BOSSES에서 찾는다 */
  day: string
  name: string
  heroes: LoadoutSlot[]
  speedOrder?: string
  skillOrder?: string
  notes?: string
  updatedAt: string
}

/** 강림 원정대 단계별 계획 — 배치와 공략을 같이 둔다 */
export interface RaidPlan {
  id: string
  /** RAID_STAGES 중 하나 */
  stage: string
  /** 배치된 길드원 (최대 RAID_SLOTS) */
  assigned: string[]
  /** 이 단계 공략 */
  decks: AttackDeck[]
  memo?: string
  updatedAt: string
}

export interface UserData {
  customHeroes: Hero[]
  /** 초기 데이터 위에 덮어쓰는 카운터 엔트리 (id 충돌 시 사용자 버전 우선) */
  counters: CounterEntry[]
  /** 초기 카운터 중 숨김 처리한 id */
  hiddenCounterIds: string[]
  savedDecks: SavedDeck[]
  members: Member[]
  customGuides: GuideSection[]
  /** 초기 데이터 위에 덮어쓰는 결투장 엔트리 (id 충돌 시 사용자 버전 우선) */
  arenaEntries: ArenaEntry[]
  /** 초기 결투장 데이터 중 숨김 처리한 id */
  hiddenArenaIds: string[]
  /** 공성전 통계 (회차별) */
  siegeRounds: StatRound[]
  /** 파괴신 통계 (회차별) */
  destroyerRounds: StatRound[]
  /** 커트라인 기준표 */
  cutlineGuide?: CutlineGuide
  /** 길드전 방어 세팅 */
  defenseSetups: DefenseSetup[]
  /** 길드전 공격 — 상대 덱별 공략 */
  attackTargets: AttackTarget[]
  /** 공성전 요일 보스 공략 */
  siegeGuides: SiegeGuide[]
  /** 강림 원정대 단계별 배치·공략 */
  raidPlans: RaidPlan[]
}
