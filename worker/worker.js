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

// 마지막 백업 시각 (isolate 메모리 — 재시작 시 0으로 돌아가도 무해)
let lastBackupAt = 0

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })

    const path = new URL(request.url).pathname.replace(/\/+$/, '')

    // 직전 버전 조회 (실수 복구용): GET /data/prev
    if (path.endsWith('/data/prev')) {
      const raw = env.GUILD_KV ? await env.GUILD_KV.get('guild-data-prev') : null
      return new Response(raw || '{}', {
        headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
      })
    }

    // ===== 공유 데이터 (카운터덱·영웅·가이드·통계 등) =====
    if (path.endsWith('/data')) {
      if (request.method === 'GET') {
        const raw = env.GUILD_KV ? await env.GUILD_KV.get('guild-data') : null
        return new Response(raw || '{}', {
          headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
        })
      }
      if (request.method === 'POST') {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: '요청 형식이 올바르지 않아요.' }, 400)
        }
        if (!env.GUILD_KV) return json({ error: '서버에 GUILD_KV가 설정되지 않았어요.' }, 500)
        // 덱·가이드·통계 등 공유 데이터는 길드원 누구나 편집 가능(공개, 비번 없음).
        // 실수·장난으로 통째로 지워지는 것 대비: 직전 버전을 guild-data-prev 에 백업.
        // 단 KV 무료 쓰기 한도(하루 1000회) 절약을 위해 백업은 10분에 1번만.
        const next = JSON.stringify(body.data ?? {})
        if (Date.now() - lastBackupAt > 10 * 60 * 1000) {
          const prev = await env.GUILD_KV.get('guild-data')
          if (prev && prev !== next) {
            await env.GUILD_KV.put('guild-data-prev', prev)
            lastBackupAt = Date.now()
          }
        }
        await env.GUILD_KV.put('guild-data', next)
        return json({ ok: true })
      }
      return json({ error: 'GET 또는 POST만 지원해요.' }, 405)
    }

    return json({ error: '없는 경로예요.' }, 404)
  },
}
