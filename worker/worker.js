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
  'members', 'customGuides', 'siegeRounds', 'destroyerRounds',
]

// 백업 시각 (isolate 메모리 — 재시작 시 초기화돼도 무해, 몇 번 더 백업될 뿐)
let lastBackupAt = 0
let lastDailyDay = ''

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })

    const path = new URL(request.url).pathname.replace(/\/+$/, '')

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
