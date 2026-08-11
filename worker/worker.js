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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })

    const path = new URL(request.url).pathname.replace(/\/+$/, '')

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
