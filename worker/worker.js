// 세나 리버스 길드전 AI 검색 프록시 (Cloudflare Worker)
// - ANTHROPIC_API_KEY 는 서버(Cloudflare)에만 보관 → 사이트에 노출되지 않음
// - GUILD_PASSWORD 를 아는 운영진만 호출 가능
// - 한 번 호출당 max_tokens·웹검색 횟수를 제한해 $ 소진 속도를 억제
//
// 배포 방법은 이 폴더의 README.md 참고.

const SYSTEM_PROMPT = `당신은 모바일 게임 "세븐나이츠 리버스(Seven Knights Re:BIRTH, 넷마블)"의 길드전 공략 전문가입니다.

규칙:
- 길드전은 3인 파티 PvP 콘텐츠입니다. (5인 방덱은 별개 콘텐츠인 총력전이니 혼동하지 마세요.)
- 라이브 게임이라 메타가 패치로 자주 바뀝니다. 반드시 web_search로 최신 정보를 먼저 확인한 뒤 답하세요.
- 한국어로, 핵심만 간결하게 답하세요.
- 방어덱 카운터를 물으면 "카운터덱(영웅 3인) + 진형 + 스킬 순서/주의점" 형태로 정리하세요.
- 확실한 정보와 추측/오래된 정보를 구분하고, 가능하면 출처(커뮤니티/영상 등)를 한 줄로 남기세요.
- 검색으로도 확인이 안 되면 모른다고 솔직히 말하세요.
- 인벤/디시 세나리버스 갤러리/나무위키/유튜브 공략 등을 우선 참고하세요.`

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
  })
}

// 신형 모델은 동적 필터링 웹검색, 그 외(Haiku 등)는 기본 웹검색 사용
function webSearchTool(model) {
  const newer = /opus-4-(6|7|8)|sonnet-5|sonnet-4-6|fable-5|mythos-5/.test(model)
  return { type: newer ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: 5 }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
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

    const model = env.CLAUDE_MODEL || 'claude-haiku-4-5'

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
          system: SYSTEM_PROMPT,
          tools: [webSearchTool(model)],
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

    return json({ answer: answer || '(빈 응답)', usage: data.usage, model })
  },
}
