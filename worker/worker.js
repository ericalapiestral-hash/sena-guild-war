// 낭만주의 길드 공유 백엔드 (Cloudflare Worker)
//  공유 데이터 (GET/POST /data) — KV(GUILD_KV)에 길드 공유 데이터(카운터덱·영웅·가이드·통계 등) 저장.
//  (AI 공략검색 기능은 2026-07-14 제거됨.)
// KV 설정은 worker/README.md 참고.

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
  })
}

function rawJson(raw) {
  return new Response(raw || '{}', {
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
  })
}

// UserData의 배열 필드 — 배열이 아닌 값이 들어오면 전 길드원 화면이 깨지므로 거부
const ARRAY_FIELDS = [
  'customHeroes', 'counters', 'hiddenCounterIds', 'savedDecks',
  'members', 'customGuides', 'arenaEntries', 'hiddenArenaIds',
  'siegeRounds', 'destroyerRounds',
]

// 백업 시각 (isolate 메모리 — 재시작 시 초기화돼도 무해, 몇 번 더 백업될 뿐)
let lastBackupAt = 0
let lastDailyDay = ''

// ===== 통계 API (읽기 전용 — 디스코드 봇 등 외부 연동용) =====
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

/** 오늘 요일 (KST 기준 — 워커는 UTC로 돎) */
function kstWeekday() {
  return WEEKDAYS[(new Date(Date.now() + 9 * 3600 * 1000).getUTCDay() + 6) % 7]
}

/** 등락 % (소수 1자리). 비교 불가면 null.
 *  사이트(Math.abs(p).toFixed(1))와 동일하게 절댓값 기준으로 반올림 후 부호 복원 —
 *  음수 하프값(-6.25 등)에서 사이트 표와 0.1%p 어긋나지 않게. */
function pctOf(prev, cur) {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return null
  const p = ((cur - prev) / Math.abs(prev)) * 100
  const r = Math.round(Math.abs(p) * 10) / 10
  return p < 0 ? -r : r
}

/** 배열이면 객체 원소만 남기고, 아니면 빈 배열 — 오염된 공유 데이터로 API가 죽지 않게 */
function objArray(v) {
  return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []
}

/** 후보 중 '기록이 있는' 최신 회차 우선, 없으면 그냥 최신 회차 */
function pickFrom(list, hasData) {
  if (!list.length) return null
  if (hasData) {
    for (let i = list.length - 1; i >= 0; i--) if (hasData(list[i])) return list[i]
  }
  return list[list.length - 1]
}

/** 라벨 완전일치 → 부분일치 → 미지정이면 전체에서.
 *  각 단계 모두 '기록 있는 최신' 우선 — 막 만들어진 빈 회차('8월 1분기' 등)가
 *  "!파괴신 1분기" 같은 조회를 빈 표로 만들지 않게. */
function pickRound(rounds, query, hasData) {
  if (!rounds.length) return null
  if (query) {
    const q = String(query).trim()
    const exact = rounds.filter((r) => r.label === q)
    if (exact.length) return pickFrom(exact, hasData)
    const partial = rounds.filter((r) => r.label.includes(q))
    return pickFrom(partial, hasData)
  }
  return pickFrom(rounds, hasData)
}

/** 동점자 순서를 사이트 표와 맞추기 위해, 정렬 전에 현재 길드원 명단 순서로 재배열 */
function rosterOrdered(entries, members) {
  const idx = new Map(members.map((m, i) => [m.name, i]))
  return entries
    .map((e, i) => ({ e, k: idx.has(e.name) ? idx.get(e.name) : members.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.e)
}

/** 공성전 통계 계산 — 사이트 표와 동일 로직 (요일별 순위·전주 대비·요일별 커트라인) */
function siegeStats(data, weekQuery, dayQuery) {
  const rounds = objArray(data.siegeRounds).filter((r) => typeof r.label === 'string')
  const members = objArray(data.members).filter((m) => typeof m.name === 'string')
  const round = pickRound(rounds, weekQuery, (r) => {
    const ds = r.days && typeof r.days === 'object' ? r.days : {}
    return WEEKDAYS.some((d) => objArray(ds[d]).some((e) => typeof e.value === 'number'))
  })
  if (!round) return { status: 404, body: { ok: false, error: weekQuery ? `'${weekQuery}' 주차를 찾을 수 없어요.` : '기록된 주차가 없어요.' } }

  const days = round.days && typeof round.days === 'object' ? round.days : {}
  const scoredOf = (v) => objArray(v).filter((e) => typeof e.name === 'string' && typeof e.value === 'number')
  const dayCounts = {}
  for (const d of WEEKDAYS) dayCounts[d] = scoredOf(days[d]).length

  let day = dayQuery ? String(dayQuery).trim().replace(/요일$/, '') : ''
  if (day && !WEEKDAYS.includes(day)) {
    return { status: 400, body: { ok: false, error: '요일은 월·화·수·목·금·토·일 중 하나로 지정하세요.' } }
  }
  if (!day) {
    // 미지정: 데이터가 있는 가장 최근 요일, 그것도 없으면 오늘(KST)
    day = [...WEEKDAYS].reverse().find((d) => dayCounts[d] > 0) ?? kstWeekday()
  }

  const idx = rounds.indexOf(round)
  const prev = idx > 0 ? rounds[idx - 1] : null
  const prevDays = prev && prev.days && typeof prev.days === 'object' ? prev.days : {}
  const prevMap = new Map(scoredOf(prevDays[day]).map((e) => [e.name, e.value]))
  const dayCuts = round.dayCutlines && typeof round.dayCutlines === 'object' ? round.dayCutlines : {}
  const rawCut = dayCuts[day] ?? round.cutline
  const cutline = typeof rawCut === 'number' ? rawCut : null
  const list = rosterOrdered(scoredOf(days[day]), members).sort((a, b) => b.value - a.value)
  const entries = list.map((e, i) => ({
    rank: i + 1,
    name: e.name,
    value: e.value,
    prev: prevMap.get(e.name) ?? null,
    deltaPct: pctOf(prevMap.get(e.name), e.value),
    fail: typeof cutline === 'number' && e.value <= cutline,
  }))
  return {
    status: 200,
    body: {
      ok: true,
      kind: 'siege',
      week: round.label,
      day,
      prevWeek: prev ? prev.label : null,
      cutline,
      count: entries.length,
      total: entries.reduce((s, e) => s + e.value, 0),
      failCount: entries.filter((e) => e.fail).length,
      dayCounts,
      weeks: rounds.map((r) => r.label),
      entries,
    },
  }
}

/** 파괴신 통계 계산 — 사이트 표와 동일 로직 (최종 우선·중간집계 폴백, 등급별 커트라인) */
function destroyerStats(data, seasonQuery) {
  const rounds = objArray(data.destroyerRounds).filter((r) => typeof r.label === 'string')
  const round = pickRound(rounds, seasonQuery, (r) =>
    objArray(r.entries).some((e) => typeof e.value === 'number' || typeof e.mid === 'number'),
  )
  if (!round) return { status: 404, body: { ok: false, error: seasonQuery ? `'${seasonQuery}' 시즌을 찾을 수 없어요.` : '기록된 시즌이 없어요.' } }

  const eff = (e) => (typeof e.value === 'number' ? e.value : typeof e.mid === 'number' ? e.mid : null)
  const idx = rounds.indexOf(round)
  const prev = idx > 0 ? rounds[idx - 1] : null
  const prevMap = new Map(
    objArray(prev?.entries)
      .filter((e) => typeof e.name === 'string' && typeof e.value === 'number')
      .map((e) => [e.name, e.value]),
  )
  const members = objArray(data.members).filter((m) => typeof m.name === 'string')
  const tierOf = new Map(members.filter((m) => typeof m.tier === 'string').map((m) => [m.name, m.tier]))
  const tierCuts = round.tierCutlines && typeof round.tierCutlines === 'object' ? round.tierCutlines : {}
  const cutFor = (name) => {
    const t = tierOf.get(name)
    const tc = t !== undefined ? tierCuts[t] : undefined
    return typeof tc === 'number' ? tc : typeof round.cutline === 'number' ? round.cutline : null
  }
  const list = rosterOrdered(
    objArray(round.entries).filter((e) => typeof e.name === 'string' && eff(e) !== null),
    members,
  ).sort((a, b) => eff(b) - eff(a))
  const entries = list.map((e, i) => {
    const v = eff(e)
    const cut = cutFor(e.name)
    return {
      rank: i + 1,
      name: e.name,
      tier: tierOf.get(e.name) ?? null,
      prev: prevMap.get(e.name) ?? null,
      mid: typeof e.mid === 'number' ? e.mid : null,
      value: typeof e.value === 'number' ? e.value : null,
      eff: v,
      deltaPrevPct: pctOf(prevMap.get(e.name), v),
      deltaMidPct: pctOf(typeof e.mid === 'number' ? e.mid : undefined, typeof e.value === 'number' ? e.value : undefined),
      cutline: cut,
      fail: typeof cut === 'number' && v <= cut,
    }
  })
  return {
    status: 200,
    body: {
      ok: true,
      kind: 'destroyer',
      season: round.label,
      prevSeason: prev ? prev.label : null,
      cutline: typeof round.cutline === 'number' ? round.cutline : null,
      tierCutlines: tierCuts,
      count: entries.length,
      midCount: entries.filter((e) => e.mid !== null).length,
      finalCount: entries.filter((e) => e.value !== null).length,
      total: entries.reduce((s, e) => s + e.eff, 0),
      failCount: entries.filter((e) => e.fail).length,
      seasons: rounds.map((r) => r.label),
      entries,
    },
  }
}

// ===== 캡처 점수 읽기 (/ocr) =====
// 게임 랭킹 화면 캡처에서 닉네임·점수를 Workers AI 비전 모델로 읽는다.
// 브라우저 tesseract는 게임 폰트·아바타 그림에서 한계가 뚜렷해서(자릿수가 끼어드는
// 오독까지 났다) 서버 쪽 모델로 옮겼다. 클라이언트는 실패 시 tesseract로 폴백.

// 사이트가 아닌 곳에서 무료 할당량을 태우는 걸 막는 최소한의 문지방
const OCR_ORIGINS = [
  'https://ericalapiestral-hash.github.io',
  'http://localhost:5199',
  'http://localhost:5200',
]

// 실측 비교 결과(2026-08-13, 실제 랭킹 캡처 3종):
//   llama-4-scout    — 보이는 행 전부 정확 (10/10·10/10·9/10), 4~7초
//   llama-3.2-vision — 라이선스 동의 필요해서 미사용
//   gemma-3-12b      — 이 계정에서 접근 불가
// 허용 목록 밖 모델은 거부(비싼 모델 무단 사용 방지).
const OCR_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct']
const OCR_DEFAULT_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

function ocrPrompt(roster) {
  const list = roster.length ? `\n참고 — 길드원 명단: ${roster.join(', ')}\n읽은 닉네임이 명단의 이름과 사실상 같으면 명단 표기를 그대로 써라.` : ''
  return `이 이미지는 모바일 게임의 길드원 랭킹 화면 캡처다. 순위 목록의 각 행에서 순위·닉네임·점수를 읽어라.

규칙:
- 닉네임 아래 작은 보라색 글씨(길드 이름)는 닉네임이 아니다. 무시하라.
- 재화·기타 UI 숫자는 점수가 아니다. 각 행 오른쪽의 큰 숫자만 점수다.
- 점수는 쉼표를 뺀 정수로, 순위는 행 왼쪽의 번호를 정수로 적어라.
- 위나 아래가 잘려 일부만 보이는 행은 빼라.
- 중요: 화면 맨 아래에 목록과 구분선으로 분리된, 배경이 어두운 별도의 행이 있을 수 있다(본인 순위 요약). 그 행은 목록이 아니다 — 절대 결과에 넣지 마라. 배경이 밝은 목록 행만 읽어라.${list}

다른 말 없이 JSON 배열만 출력하라: [{"rank":21,"name":"닉네임","score":12345678}]`
}

/** 모델별 입력 형식이 달라서 두 형식을 차례로 시도한다 */
/** 모델 응답 정규화 — 런타임이 JSON을 이미 파싱해 배열로 주기도 한다(llama-4) */
function normalizeOut(res) {
  if (typeof res === 'string') return res
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.response)) return res.response
  return res?.response ?? res?.description ?? ''
}

function b64of(bytes) {
  let b = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(b)
}

async function runVision(env, model, prompt, bytes, mime, debug) {
  if (debug === 'messages' || debug === 'prompt') {
    // 진단용: 해당 형식의 원응답을 그대로 돌려본다
    const req = debug === 'messages'
      ? { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${b64of(bytes)}` } }] }], max_tokens: 2048 }
      : { prompt, image: Array.from(bytes), max_tokens: 2048 }
    const res = await env.AI.run(model, req)
    return { out: JSON.stringify(res).slice(0, 4000), shape: 'debug:' + debug }
  }
  // 1) messages + data URL (llama-4·gemma 계열)
  try {
    const res = await env.AI.run(model, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64of(bytes)}` } },
          ],
        },
      ],
      max_tokens: 2048,
    })
    const out = normalizeOut(res)
    if (out) return { out, shape: 'messages' }
  } catch (e) {
    // 형식이 안 맞는 모델이면 아래 형식으로
  }
  // 2) prompt + 바이트 배열 (llama-3.2-vision·llava 계열)
  const res = await env.AI.run(model, {
    prompt,
    image: Array.from(bytes),
    max_tokens: 2048,
  })
  return { out: normalizeOut(res), shape: 'prompt' }
}

/** 모델 출력에서 JSON 배열을 끄집어낸다 (문자열이든, 이미 파싱된 배열이든) */
function extractRows(out) {
  let arr = null
  if (Array.isArray(out)) {
    // 일부 모델(llama-4 등)은 JSON을 이미 파싱된 배열로 돌려준다
    arr = out
  } else if (typeof out === 'string') {
    const start = out.indexOf('[')
    const end = out.lastIndexOf(']')
    if (start < 0 || end <= start) return null
    try {
      arr = JSON.parse(out.slice(start, end + 1))
    } catch {
      return null
    }
  }
  if (!Array.isArray(arr)) return null
  const rows = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const name = typeof it.name === 'string' ? it.name.trim() : ''
    const score = Number(it.score)
    if (!name || !Number.isSafeInteger(score) || score < 0) continue
    const rank = Number.isSafeInteger(Number(it.rank)) && Number(it.rank) > 0 ? Number(it.rank) : undefined
    rows.push(rank !== undefined ? { rank, name, score } : { name, score })
  }
  return rows
}

async function handleOcr(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST만 지원해요.' }, 405)
  if (!env.AI) return json({ error: '서버에 AI 바인딩이 없어요.' }, 500)

  const origin = request.headers.get('origin') || ''
  if (!OCR_ORIGINS.includes(origin)) return json({ error: '허용되지 않은 출처예요.' }, 403)

  const text = await request.text()
  if (text.length > 8_000_000) return json({ error: '이미지가 너무 커요. 목록 부분만 잘라서 올려보세요.' }, 413)

  let body
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: '요청 형식이 올바르지 않아요.' }, 400)
  }

  const b64 = typeof body.image === 'string' ? body.image : ''
  if (!b64) return json({ error: 'image(base64)가 필요해요.' }, 400)
  const mime = typeof body.mime === 'string' && /^image\/[a-z+.-]+$/.test(body.mime) ? body.mime : 'image/png'
  const roster = Array.isArray(body.roster)
    ? body.roster.filter((n) => typeof n === 'string' && n.length <= 40).slice(0, 100)
    : []
  const model = OCR_MODELS.includes(body.model) ? body.model : OCR_DEFAULT_MODEL

  let bytes
  try {
    const bin = atob(b64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return json({ error: 'base64를 해석할 수 없어요.' }, 400)
  }

  try {
    const { out, shape } = await runVision(env, model, ocrPrompt(roster), bytes, mime, body.debug)
    const raw = (typeof out === 'string' ? out : JSON.stringify(out)).slice(0, 2000)
    if (String(shape).startsWith('debug:')) return json({ ok: false, model, shape, raw: (typeof out === 'string' ? out : JSON.stringify(out)).slice(0, 4000) })
    const rows = extractRows(out)
    if (!rows) return json({ ok: false, error: '모델 출력에서 표를 찾지 못했어요.', model, raw }, 502)
    return json({ ok: true, rows, model, shape, raw })
  } catch (e) {
    return json({ ok: false, error: `모델 호출 실패: ${e && e.message ? e.message : e}`, model }, 502)
  }
}

// ===== 학습 API (/learn) =====
// 공식 네이버 라운지(공략&TIP·Best 공략)에서 길드전 관련 새 글을 모아
// Workers AI로 요약하고, 아는 영웅 목록에 없는 이름은 '신규 영웅 후보'로 띄운다.
// 관리자가 사이트에서 버튼을 눌렀을 때만 돈다. 결과는 KV에 저장돼 전 길드원이 본다.
// (디시인사이드는 데이터센터 IP를 막아 워커에서 못 읽는다 — 실측 2026-08-13)

const LOUNGE = 'sena_rebirth'
const LOUNGE_API = `https://apis.naver.com/nng_main/nng_main/community/lounge/${LOUNGE}`
const LOUNGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: `https://game.naver.com/lounge/${LOUNGE}/`,
  Accept: 'application/json',
}
const LEARN_BOARDS = [
  { id: 13, name: '공략&TIP', take: 30 },
  { id: 12, name: 'Best 공략', take: 15 },
]
// 길드전(공성전·파괴신) + 결투장 글만 학습한다
const LEARN_KEYWORDS = ['공성', '파괴신', '길드전', '결투장', '결장', '방덱', '공덱', '카운터', '침공']
const LEARN_MIN_INTERVAL_MS = 10 * 60 * 1000 // 연타로 할당량 태우는 것 방지
const LEARN_MAX_POSTS = 8 // 한 번에 요약할 새 글 상한

const unescapeHtml2 = (v) =>
  String(v ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

function loungeHtmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*>/gi, '\n[이미지]\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => unescapeHtml2(l).trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 스마트에디터 문서 JSON → 평문 (tools/naver-lounge.mjs와 같은 로직) */
function loungeDocToText(raw) {
  let doc
  try {
    doc = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return ''
  }
  const comps = doc?.document?.components ?? []
  const out = []
  const paragraphs = (value = []) => {
    for (const p of value) out.push((p.nodes ?? []).map((n) => n.value ?? '').join('').trim())
  }
  for (const c of comps) {
    switch (c['@ctype']) {
      case 'text':
        paragraphs(c.value)
        break
      case 'quotation':
        paragraphs(c.value)
        break
      case 'image':
      case 'imageStrip':
      case 'video':
      case 'sticker':
        out.push('[이미지]')
        break
      case 'table':
        for (const row of c?.value ?? []) {
          const cells = (row?.cells ?? []).map((cell) => {
            const buf = []
            for (const sub of cell?.value ?? [])
              if (sub['@ctype'] === 'text')
                for (const p of sub.value ?? []) buf.push((p.nodes ?? []).map((n) => n.value ?? '').join('').trim())
            return buf.join(' ')
          })
          out.push('| ' + cells.join(' | ') + ' |')
        }
        break
      default:
        break
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const loungeContentsToText = (raw) => {
  const s2 = typeof raw === 'string' ? raw.trim() : ''
  return s2.startsWith('<') ? loungeHtmlToText(s2) : loungeDocToText(raw)
}

async function fetchLoungeFeeds(boardId, take) {
  const q = new URLSearchParams({ offset: '0', limit: String(take), order: 'NEW', boardId: String(boardId), buffFilteringYN: 'N' })
  const res = await fetch(`${LOUNGE_API}/feed?${q}`, { headers: LOUNGE_HEADERS })
  if (!res.ok) throw new Error(`라운지 응답 ${res.status}`)
  const j = await res.json()
  return j?.content?.feeds ?? []
}

/** 텍스트 전용 모델 호출 */
async function runText(env, prompt) {
  const res = await env.AI.run(OCR_DEFAULT_MODEL, {
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    max_tokens: 2048,
  })
  return normalizeOut(res)
}

/** 모델 출력에서 JSON 객체를 끄집어낸다 */
function extractObject(out) {
  if (out && typeof out === 'object' && !Array.isArray(out)) return out
  if (typeof out !== 'string') return null
  const a = out.indexOf('{')
  const b = out.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    return JSON.parse(out.slice(a, b + 1))
  } catch {
    return null
  }
}

const normName = (v) => String(v ?? '').toLowerCase().replace(/[\s·.,_\-]/g, '')

function learnPrompt(posts, heroes) {
  const heroList = heroes.length ? `\n\n아는 영웅 목록(이 게임의 등록된 영웅들): ${heroes.join(', ')}` : ''
  const corpus = posts
    .map((p) => `### 글 ${p.feedId} [${p.board}] ${p.title} (${p.date})\n${p.text.slice(0, 2200)}`)
    .join('\n\n')
  return `너는 모바일 게임 '세븐나이츠 리버스'의 길드전 분석가다. 아래는 공식 커뮤니티에 새로 올라온 글들이다.

${corpus}${heroList}

각 글을 분석해 JSON으로만 답하라:
{
 "items": [
   {"feedId": 숫자, "category": "공성전"|"파괴신"|"결투장"|"기타", "summary": "핵심만 2~3문장", "heroes": ["글에 등장한 영웅 이름들"]}
 ],
 "newHeroes": ["아는 영웅 목록에 없는 새 영웅으로 보이는 이름들 (확실한 것만, 없으면 빈 배열)"],
 "meta": "전체 글들에서 읽히는 최근 흐름 한두 문장 (새 메타·자주 쓰이는 덱 등)"
}

분류 규칙:
- 공성전·길드전 글 = "공성전", 파괴신 글 = "파괴신"
- 결투장 글 = "결투장" (상결=상급 결투장, 일결=일반 결투장, 실시간결도 전부 결투장)
- 총력전·던전·성장·모험 등 그 밖의 컨텐츠 = "기타"
- 공략이 아닌 글(질문·요청·건의·불만·잡담)은 items에서 아예 빼라

요약 규칙:
- 글에 나온 실제 덱 조합을 영웅 이름 그대로 적어라. 예: "여포·미스트·란드그리드 방덱을 선란·태오·콜트 속공덱으로 카운터".
- "다양한 덱과 전략을 소개합니다" 같은 두루뭉술한 문장 금지. 원문에 구체적 내용이 없으면 없다고 적어라.
- 이미지가 대부분인 글은 제목과 남은 텍스트로만 판단하고 summary 끝에 "(이미지 위주 글)"을 붙여라.
- 지어내지 마라.

newHeroes 규칙:
- 덱 이름·조합 별칭(라오엘, 파마덱, 선란덱 등)과 줄임말·오타·스킬명은 영웅이 아니다.
- 아는 영웅 목록에 이미 있는 이름의 줄임말이면 넣지 마라. 새 영웅이 확실한 것만.`
}

/** 브리핑에서 비길드전 글을 걸러낸다 — 어느 경로로 내보내든 같은 기준 */
function filterBriefing(d) {
  if (!d || !Array.isArray(d.items)) return d
  return { ...d, items: d.items.filter((it) => ['공성전', '파괴신', '결투장'].includes(it?.category)) }
}

/** 라운지에서 지워진 글인지 확인 — 단건 조회가 실패하면 지워진 것으로 본다 */
async function feedAlive(feedId) {
  try {
    const res = await fetch(`${LOUNGE_API}/feed/${feedId}`, { headers: LOUNGE_HEADERS })
    if (!res.ok) return false
    const j = await res.json()
    return !!j?.content?.feed?.feedId
  } catch {
    return true // 네트워크 오류로는 글을 지우지 않는다
  }
}

async function handleLearn(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST만 지원해요.' }, 405)
  if (!env.AI || !env.GUILD_KV) return json({ error: '서버 설정이 부족해요.' }, 500)
  const origin = request.headers.get('origin') || ''
  if (!OCR_ORIGINS.includes(origin)) return json({ error: '허용되지 않은 출처예요.' }, 403)

  let body = {}
  try {
    body = JSON.parse(await request.text())
  } catch {
    body = {}
  }
  const heroes = Array.isArray(body.heroes)
    ? body.heroes.filter((n) => typeof n === 'string' && n.length <= 40).slice(0, 250)
    : []

  let state = { seen: [], lastRunAt: 0 }
  try {
    const raw = await env.GUILD_KV.get('learn-state')
    if (raw) state = { ...state, ...JSON.parse(raw) }
  } catch { /* 초기 상태로 */ }

  const latestRaw = await env.GUILD_KV.get('learn-latest')
  const latest = latestRaw ? JSON.parse(latestRaw) : null

  if (Date.now() - state.lastRunAt < LEARN_MIN_INTERVAL_MS) {
    const wait = Math.ceil((LEARN_MIN_INTERVAL_MS - (Date.now() - state.lastRunAt)) / 60000)
    return json({ ok: false, error: `방금 학습했어요. ${wait}분 뒤에 다시 눌러 주세요.`, latest: filterBriefing(latest) }, 429)
  }

  // 1) 게시판 훑기
  const posts = []
  for (const b of LEARN_BOARDS) {
    let feeds = []
    try {
      feeds = await fetchLoungeFeeds(b.id, b.take)
    } catch {
      continue
    }
    for (const item of feeds) {
      const f = item.feed ?? {}
      if (!f.feedId) continue
      const title = unescapeHtml2(f.title ?? '')
      const text = loungeContentsToText(f.contents)
      const hay = title + ' ' + text.slice(0, 800)
      if (!LEARN_KEYWORDS.some((k) => hay.includes(k))) continue
      posts.push({
        feedId: f.feedId,
        boardId: b.id,
        board: b.name,
        title,
        date: String(f.createdDate ?? '').slice(0, 8),
        text,
        url: `https://game.naver.com/lounge/${LOUNGE}/board/${b.id}/detail/${f.feedId}`,
      })
    }
  }

  const seen = new Set(state.seen)
  const fresh = posts.filter((p) => !seen.has(p.feedId)).slice(0, LEARN_MAX_POSTS)

  if (fresh.length === 0) {
    state.lastRunAt = Date.now()
    await env.GUILD_KV.put('learn-state', JSON.stringify(state))
    return json({ ok: true, freshCount: 0, message: '지난 학습 이후 새 길드전 글이 없어요.', latest: filterBriefing(latest) })
  }

  // 2) 한 번의 AI 호출로 전부 요약
  let parsed = null
  try {
    const out = await runText(env, learnPrompt(fresh, heroes))
    parsed = extractObject(out)
  } catch (e) {
    return json({ ok: false, error: `요약 모델 호출 실패: ${e && e.message ? e.message : e}`, latest: filterBriefing(latest) }, 502)
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    return json({ ok: false, error: '모델 응답을 해석하지 못했어요. 잠시 뒤 다시 시도해 주세요.', latest: filterBriefing(latest) }, 502)
  }

  const byId = new Map(fresh.map((p) => [p.feedId, p]))
  const items = []
  for (const it of parsed.items) {
    const src = byId.get(Number(it?.feedId))
    if (!src) continue
    // 길드전(공성전·파괴신)과 결투장 글만 브리핑에 남긴다 — 그 밖의 컨텐츠는 버림
    if (!['공성전', '파괴신', '결투장'].includes(it.category)) continue
    items.push({
      feedId: src.feedId,
      title: src.title,
      date: src.date,
      board: src.board,
      url: src.url,
      category: it.category,
      summary: String(it.summary ?? '').slice(0, 600),
      heroes: Array.isArray(it.heroes) ? it.heroes.filter((h) => typeof h === 'string').slice(0, 20) : [],
    })
  }

  // 3) 신규 영웅 후보 — 모델 제안을 아는 목록과 서버에서 한 번 더 대조
  const known = new Set(heroes.map(normName))
  const newHeroes = [
    ...new Set(
      (Array.isArray(parsed.newHeroes) ? parsed.newHeroes : [])
        .filter((h) => typeof h === 'string' && h.trim().length >= 2 && h.length <= 20)
        .map((h) => h.trim())
        .filter((h) => !known.has(normName(h))),
    ),
  ].slice(0, 10)

  const result = {
    at: Date.now(),
    freshCount: items.length,
    items,
    newHeroes,
    meta: String(parsed.meta ?? '').slice(0, 400),
  }

  // 이전 학습분의 새 영웅 후보는 등록 전까지 잊지 않게 이어 붙인다
  if (latest && Array.isArray(latest.newHeroes)) {
    for (const h of latest.newHeroes) {
      if (!known.has(normName(h)) && !result.newHeroes.some((x) => normName(x) === normName(h)) && result.newHeroes.length < 10) {
        result.newHeroes.push(h)
      }
    }
  }

  // 최근 학습분(있으면)의 글도 함께 보여 주면 브리핑이 갑자기 짧아지지 않는다.
  // 예전 기준으로 저장된 기타(비길드전) 글은 걸러 내고, 라운지에서 지워진 글도
  // 여기서 정리한다 (새 글은 방금 목록에 있었으니 살아 있는 게 확실).
  if (latest && Array.isArray(latest.items)) {
    const have = new Set(result.items.map((i) => i.feedId))
    const carry = latest.items.filter(
      (it) => ['공성전', '파괴신', '결투장'].includes(it?.category) && !have.has(it.feedId),
    )
    const alive = await Promise.all(carry.map((it) => feedAlive(it.feedId)))
    for (let i = 0; i < carry.length; i++) {
      if (alive[i] && result.items.length < 15) result.items.push(carry[i])
    }
  }

  state.seen = [...state.seen, ...fresh.map((p) => p.feedId)].slice(-500)
  state.lastRunAt = Date.now()
  await env.GUILD_KV.put('learn-latest', JSON.stringify(result))
  await env.GUILD_KV.put('learn-state', JSON.stringify(state))
  return json({ ok: true, ...result })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })

    const path = new URL(request.url).pathname.replace(/\/+$/, '')

    // ===== 캡처 점수 읽기 =====
    if (path.endsWith('/ocr')) return handleOcr(request, env)

    // ===== 학습 =====
    if (path.endsWith('/learn/latest')) {
      const raw = env.GUILD_KV ? await env.GUILD_KV.get('learn-latest') : null
      // 예전 기준으로 저장된 비길드전 글이 캐시에 남아 있어도 내보내지 않는다
      try {
        const d = JSON.parse(raw || '{}')
        if (Array.isArray(d.items)) {
          d.items = d.items.filter((it) => ['공성전', '파괴신', '결투장'].includes(it?.category))
        }
        return json(d)
      } catch {
        return rawJson(raw)
      }
    }
    if (path.endsWith('/learn')) return handleLearn(request, env)

    // ===== 통계 API (읽기 전용) =====
    // GET /api/siege?week=<주차 라벨(부분일치 가능)>&day=<월~일>
    // GET /api/destroyer?season=<시즌 라벨(부분일치 가능)>
    if (path.endsWith('/api/siege') || path.endsWith('/api/destroyer')) {
      if (request.method !== 'GET') return json({ error: 'GET만 지원해요.' }, 405)
      try {
        const raw = env.GUILD_KV ? await env.GUILD_KV.get('guild-data') : null
        let data = {}
        try {
          data = raw ? JSON.parse(raw) : {}
        } catch {
          data = {}
        }
        // JSON "null" 등 비객체 값 방어
        if (!data || typeof data !== 'object' || Array.isArray(data)) data = {}
        const url = new URL(request.url)
        const result = path.endsWith('/api/siege')
          ? siegeStats(data, url.searchParams.get('week'), url.searchParams.get('day'))
          : destroyerStats(data, url.searchParams.get('season'))
        return json(result.body, result.status)
      } catch {
        // 어떤 오염 데이터가 와도 CORS 있는 JSON 오류로 응답 (Cloudflare 기본 500 방지)
        return json({ ok: false, error: '통계 계산 중 오류가 났어요. 데이터 상태를 확인해주세요.' }, 500)
      }
    }

    // 직전 버전 조회 (실수 복구용): GET /data/prev — 10분에 1번 백업본
    if (path.endsWith('/data/prev')) {
      const raw = env.GUILD_KV ? await env.GUILD_KV.get('guild-data-prev') : null
      return rawJson(raw)
    }

    // 일별 백업 조회 (오염·장난 복구용): GET /data/daily — 하루 1번 백업본
    if (path.endsWith('/data/daily')) {
      const raw = env.GUILD_KV ? await env.GUILD_KV.get('guild-data-daily') : null
      return rawJson(raw)
    }

    // ===== 공유 데이터 (카운터덱·영웅·가이드·통계 등) =====
    if (path.endsWith('/data')) {
      if (request.method === 'GET') {
        const raw = env.GUILD_KV ? await env.GUILD_KV.get('guild-data') : null
        return rawJson(raw)
      }
      if (request.method === 'POST') {
        if (!env.GUILD_KV) return json({ error: '서버에 GUILD_KV가 설정되지 않았어요.' }, 500)

        // 크기 제한 — 실데이터는 수십 KB 수준. 폭탄 업로드로 KV·대역폭 낭비 방지.
        const text = await request.text()
        if (text.length > 1_000_000) return json({ error: '데이터가 너무 커요.' }, 413)

        let body
        try {
          body = JSON.parse(text)
        } catch {
          return json({ error: '요청 형식이 올바르지 않아요.' }, 400)
        }

        // 형식 검증 — 깨진 데이터가 저장되면 전 길드원 사이트가 안 열림.
        const data = body && body.data
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return json({ error: 'data가 객체가 아니에요.' }, 400)
        }
        for (const k of ARRAY_FIELDS) {
          if (k in data && !Array.isArray(data[k])) {
            return json({ error: `${k} 필드는 배열이어야 해요.` }, 400)
          }
        }

        // 편집 버전은 서버 시각으로 강제 — 클라이언트가 미래 시각을 넣어
        // 모두의 동기화를 얼려버리는 조작 방지. 응답으로 돌려줘 클라이언트가 맞춰 저장.
        data._rev = Date.now()
        const next = JSON.stringify(data)

        // 백업 2단계: 직전본(10분에 1번, 실수 복구) + 일별본(하루 1번, 오염돼도 하루 전으로 복구)
        // KV 무료 쓰기 한도(하루 1000회) 절약을 위해 각각 제한.
        const day = new Date().toISOString().slice(0, 10)
        const needPrev = Date.now() - lastBackupAt > 10 * 60 * 1000
        const needDaily = day !== lastDailyDay
        if (needPrev || needDaily) {
          const prev = await env.GUILD_KV.get('guild-data')
          if (prev) {
            if (needPrev && prev !== next) {
              await env.GUILD_KV.put('guild-data-prev', prev)
              lastBackupAt = Date.now()
            }
            if (needDaily) {
              await env.GUILD_KV.put('guild-data-daily', prev)
              lastDailyDay = day
            }
          }
        }

        await env.GUILD_KV.put('guild-data', next)
        return json({ ok: true, rev: data._rev })
      }
      return json({ error: 'GET 또는 POST만 지원해요.' }, 405)
    }

    return json({ error: '없는 경로예요.' }, 404)
  },
}
