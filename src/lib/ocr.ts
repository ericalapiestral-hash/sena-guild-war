// 공성전 결과 화면 캡처에서 '닉네임 + 점수'를 읽어내는 도구.
//
// 브라우저 안에서 도는 OCR(tesseract.js)이라 서버도 API 키도 필요 없다.
// 다만 게임 폰트·배경 때문에 글자 인식은 완벽하지 않다. 그래서 읽은 이름을
// **길드원 명단과 대조해 보정**하는 게 이 파일의 핵심이다. 점수(숫자)는
// 비교적 잘 읽히지만, 최종 반영 전에 사람이 확인하는 단계를 반드시 거친다.

/** OCR이 읽어낸 한 줄 */
export interface OcrRow {
  /** 원본 줄 (사용자가 눈으로 대조할 수 있게 그대로 보관) */
  raw: string
  /** 이름으로 읽힌 부분 */
  readName: string
  /** 점수로 읽힌 부분 */
  score?: number
  /** 명단에서 찾아낸 이름 (없으면 undefined) */
  matched?: string
  /** 매칭 신뢰도 0~1 */
  confidence: number
}

/** 비교용 정규화 — 공백·특수문자 제거, 영문 소문자화 */
const norm = (s: string): string => s.toLowerCase().replace(/[\s·.,_\-|/\\[\]()]/g, '')

/** 편집 거리 (Levenshtein) */
function distance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/** 0~1 유사도 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const max = Math.max(a.length, b.length)
  return 1 - distance(a, b) / max
}

/**
 * 읽은 이름을 길드원 명단에 맞춘다.
 * OCR이 한두 글자 틀려도 명단이 30명뿐이라 대개 제대로 붙는다.
 */
export function matchName(read: string, roster: string[]): { name?: string; confidence: number } {
  const r = norm(read)
  if (!r) return { confidence: 0 }

  let best: { name: string; score: number } | undefined
  for (const cand of roster) {
    const c = norm(cand)
    let score: number
    if (c === r) score = 1
    else if (c.includes(r) || r.includes(c)) {
      // 부분 일치 — 짧은 쪽이 너무 짧으면(1~2글자) 우연일 수 있어 감점
      const shorter = Math.min(c.length, r.length)
      score = 0.9 * (shorter / Math.max(c.length, r.length)) + 0.05
    } else {
      score = similarity(c, r)
      // 짧은 이름은 한 글자만 틀려도 비율 유사도가 확 떨어진다.
      // ('엉우' → '영우' 는 2글자 중 1글자라 0.5로 잡혀 버려진다)
      // 그래서 절대 편집거리도 같이 보고, 허용 오차 안이면 매칭으로 올린다.
      const d = distance(c, r)
      const len = Math.max(c.length, r.length)
      const tol = len <= 4 ? 1 : Math.floor(len * 0.3)
      if (r.length >= 2 && d <= tol) score = Math.max(score, 0.7)
    }
    if (!best || score > best.score) best = { name: cand, score }
  }
  if (!best) return { confidence: 0 }
  // 0.55 미만이면 '못 찾음'으로 두고 사람이 직접 고르게 한다
  return best.score >= 0.55 ? { name: best.name, confidence: best.score } : { confidence: best.score }
}

/** '12,496,375' · '12 496 375' · '12.496.375' → 12496375 */
function parseScore(s: string): number | undefined {
  const digits = s.replace(/[^\d]/g, '')
  if (!digits) return undefined
  const n = Number(digits)
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}

/**
 * OCR 텍스트를 '이름 + 점수' 줄로 자른다.
 * 게임 화면은 보통 한 줄에 [닉네임 ....... 점수] 형태지만, 열 간격이 넓으면
 * 이름과 점수가 다른 줄로 쪼개져 나오기도 해서 그 경우도 이어 붙인다.
 */
export function parseLines(text: string, roster: string[]): OcrRow[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const rows: OcrRow[] = []
  let pendingName: string | null = null

  const push = (raw: string, readName: string, scoreText: string) => {
    const score = parseScore(scoreText)
    const m = matchName(readName, roster)
    rows.push({ raw, readName: readName.trim(), score, matched: m.name, confidence: m.confidence })
  }

  for (const line of lines) {
    // 줄 끝의 숫자 덩어리를 점수로 본다 (자릿수 구분자 포함)
    const m = line.match(/^(.*?)[\s:·|]*([\d][\d,.\s]{0,15})$/)
    const onlyNumber = /^[\d][\d,.\s]*$/.test(line)
    const hasDigit = /\d/.test(line)

    if (onlyNumber && pendingName) {
      push(`${pendingName}  ${line}`, pendingName, line)
      pendingName = null
      continue
    }
    if (m && m[1].trim() && parseScore(m[2]) !== undefined) {
      push(line, m[1], m[2])
      pendingName = null
      continue
    }
    // 숫자가 전혀 없는 줄 = 이름만 있는 줄일 수 있으니 다음 줄을 기다린다
    if (!hasDigit) pendingName = line
  }

  return rows
}

export interface OcrProgress {
  /** 0~1 */
  progress: number
  status: string
}

/**
 * 이미지에서 텍스트를 읽는다.
 * tesseract.js는 무겁고(코어 wasm + 한국어 학습데이터) 이 기능을 쓸 때만 필요하므로
 * 동적 import로 분리해 첫 화면 로딩에는 영향을 주지 않는다.
 */
export async function readImage(
  file: Blob,
  roster: string[],
  onProgress?: (p: OcrProgress) => void,
): Promise<{ rows: OcrRow[]; text: string }> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('kor+eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({ progress: m.progress ?? 0, status: m.status })
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return { rows: parseLines(data.text, roster), text: data.text }
  } finally {
    await worker.terminate()
  }
}
