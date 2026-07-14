// 낭만주의 길드전 공유 백엔드 (Cloudflare Worker)
//  1) AI 공략검색 프록시 (POST /)          — ANTHROPIC_API_KEY 로 Claude 웹검색
//  2) 공유 데이터 (GET/POST /data)          — KV(GUILD_KV)에 길드 공유 데이터(카운터덱·영웅·가이드 등) 저장
// 시크릿·KV 설정은 worker/README.md 참고.

const SYSTEM_PROMPT = `당신은 모바일 게임 "세븐나이츠 리버스(Seven Knights Re:BIRTH, 넷마블)"의 길드전 공략 전문가입니다.

■ 반드시 전제로 삼을 현재 게임 사실 (이 사실에 어긋나는 검색 결과는 원작/구버전 정보이니 버릴 것):
- "세븐나이츠 리버스"는 2025년 출시된 신작이며, 원작 "세븐나이츠(세나1, 10년 역사)"와는 영웅·시스템·메타가 완전히 다른 별개 게임입니다. 검색 결과가 원작 세나1 내용이면 절대 인용하지 마세요.
- ★ 각성(覺醒) 시스템은 이미 출시되어 정상 운영 중입니다. "각성 델론즈, 각성 실베스타, 각성 루디, 각성 스쿨드, 각성 오르카, 각성 클레미스, 각성 아리스, 각성 헬레니아" 등은 실제로 존재하는 영웅입니다. 각성은 등급이 아니라 성장 형태이며 원본과 다른 별개 영웅처럼 취급됩니다. "각성이 아직 안 나왔다 / 각성 델론즈가 존재하지 않는다"는 명백한 오답이니 절대 말하지 마세요.
- 길드전은 3인 파티 길드 대 길드 PvP입니다. (5인 방덱 얘기는 총력전이니 혼동 금지.)
- 영웅별 속성(불/물/땅/빛/암) 시스템은 없습니다. 유형은 공격형/마법형/방어형/지원형/만능형 5종.
- "란드그리드"(공덱 핵심 공격 영웅)와 "라드그리드"('천상의 수호자', 방덱 메인 전열 탱커, 대표덱 '라오엘'=라드그리드+손오공+엘리시아)는 이름만 비슷한 전혀 다른 별개 영웅입니다.

■ 답변 규칙:
- 라이브 게임이라 메타가 자주 바뀝니다. 반드시 web_search로 2026년 최신 정보를 확인한 뒤 답하세요. 과거(2025 이전) 정보나 원작 세나1 정보는 배제.
- 한국어로 핵심만 간결하게. 방어덱 카운터를 물으면 "카운터덱(영웅 3인) + 진형 + 스킬 순서/주의점" 형태로 정리.
- 확실한 정보와 추측을 구분하고 가능하면 출처(커뮤니티/영상 등)를 한 줄로.
- 검색으로도 확인이 안 되면 모른다고 솔직히 말하되, 위 '현재 게임 사실'을 부정하지는 마세요.
- 인벤/디시 세나리버스 갤러리/나무위키/유튜브 공략 등 최신 글 우선.`

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

function webSearchTool(model, maxUses) {
  const newer = /opus-4-(6|7|8)|sonnet-5|sonnet-4-6|fable-5|mythos-5/.test(model)
  return { type: newer ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: maxUses }
}

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

    // ===== 공유 데이터 (카운터덱·영웅·가이드 등) =====
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
        // 덱·가이드 등 공유 데이터는 길드원 누구나 편집 가능(공개, 비번 없음).
        // (AI 검색 POST / 은 여전히 GUILD_PASSWORD 필요 — 비용 보호)
        // 실수·장난으로 통째로 지워지는 것 대비: 직전 버전을 guild-data-prev 에 백업.
        const next = JSON.stringify(body.data ?? {})
        const prev = await env.GUILD_KV.get('guild-data')
        if (prev && prev !== next) await env.GUILD_KV.put('guild-data-prev', prev)
        await env.GUILD_KV.put('guild-data', next)
        return json({ ok: true })
      }
      return json({ error: 'GET 또는 POST만 지원해요.' }, 405)
    }

    // ===== AI 공략검색 =====
    if (request.method !== 'POST') return json({ error: 'POST 요청만 지원해요.' }, 405)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: '요청 형식이 올바르지 않아요.' }, 400)
    }

    if (!env.GUILD_PASSWORD || body.password !== env.GUILD_PASSWORD) {
      return json({ error: '비밀번호가 틀렸어요.' }, 401)
    }

    const query = String(body.query || '').trim().slice(0, 500)
    if (!query) return json({ error: '질문을 입력하세요.' }, 400)
    if (!env.ANTHROPIC_API_KEY) return json({ error: '서버에 API 키가 설정되지 않았어요.' }, 500)

    // ── 하루 사용 한도 (운영진 전체 합산, 비용 폭탄 방지) ──
    const DAILY_LIMIT = Number(env.AI_DAILY_LIMIT) || 5
    const today = new Date().toISOString().slice(0, 10)
    const rlKey = `ai-search:${today}`
    let used = 0
    if (env.GUILD_KV) {
      used = parseInt((await env.GUILD_KV.get(rlKey)) || '0', 10) || 0
      if (used >= DAILY_LIMIT) {
        return json({ error: `오늘 AI 검색 한도(하루 ${DAILY_LIMIT}회, 운영진 전체 합산)를 다 썼어요. 내일 다시 시도하세요.` }, 429)
      }
    }

    const model = env.CLAUDE_MODEL || 'claude-haiku-4-5'
    const webSearchUses = Number(env.AI_WEB_SEARCH_USES) || 3

    let apiResp
    try {
      apiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system:
            SYSTEM_PROMPT +
            `\n\n■ 오늘 날짜: ${new Date().toISOString().slice(0, 10)}. 이 날짜 기준으로 답하세요. 이 날짜보다 과거로 예정됐던 "출시 예정" 정보는 이미 출시된 것으로 간주하세요.`,
          tools: [webSearchTool(model, webSearchUses)],
          messages: [{ role: 'user', content: query }],
        }),
      })
    } catch (e) {
      return json({ error: 'Claude API 호출에 실패했어요.', detail: String(e) }, 502)
    }

    const data = await apiResp.json()
    if (!apiResp.ok) return json({ error: 'Claude API 오류', detail: data }, 502)

    const answer = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    // 성공한 검색만 오늘 사용량에 +1 (2일 뒤 자동 만료로 날짜 키 정리)
    if (env.GUILD_KV) {
      await env.GUILD_KV.put(rlKey, String(used + 1), { expirationTtl: 172800 })
    }

    return json({ answer: answer || '(빈 응답)', usage: data.usage, model, dailyUsed: used + 1, dailyLimit: DAILY_LIMIT })
  },
}
