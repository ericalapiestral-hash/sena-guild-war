# AI 공략검색 백엔드 (Cloudflare Worker)

운영진 비밀번호를 아는 사람만 Claude 웹검색을 돌릴 수 있게 해주는 서버예요.
API 키는 여기(Cloudflare)에만 저장되고 사이트엔 절대 노출되지 않습니다.

## 배포 (운영진 본인이 한 번만)

이 `worker` 폴더에서 순서대로 실행하세요. (`npx`라 따로 설치 안 해도 돼요.)

```bash
# 1) Cloudflare 로그인 (브라우저 창이 뜸 — 없으면 무료 가입)
npx wrangler login

# 2) 내 Anthropic API 키를 서버 비밀값으로 저장 (키를 붙여넣고 Enter)
npx wrangler secret put ANTHROPIC_API_KEY

# 3) 운영진끼리 쓸 비밀번호 정하기 (원하는 문구 입력)
npx wrangler secret put GUILD_PASSWORD

# 4) 공유 데이터(카운터덱·영웅·가이드) 저장용 KV 만들기 → 출력된 id 를 wrangler.toml 의 [[kv_namespaces]] id 에 붙여넣기
npx wrangler kv namespace create GUILD_KV

# 5) 배포
npx wrangler deploy
```

마지막에 `https://sena-guild-search.<계정>.workers.dev` 같은 주소가 출력돼요.
- **AI 공략검색 + 공유 편집**: 이 주소와 3번 비밀번호를 사이트 [AI 공략검색] → [서버 설정]에 입력. (운영진이 등록·수정한 게 이 비밀번호로 공유 저장소에 올라감)
- **전원 열람(공유 데이터 읽기)**: 이 주소를 알려주시면 사이트 `src/data/config.ts`의 `WORKER_URL`에 넣어 재배포할게요. 그러면 모든 길드원이 별도 설정 없이 운영진이 등록한 덱을 봅니다.

## 엔드포인트

- `POST /`     — AI 검색 (`{query, password}`)
- `GET /data`  — 공유 데이터(카운터덱·영웅·가이드 등) JSON 조회 (누구나, 열람용)
- `POST /data` — 공유 데이터 갱신 (`{password, data}`) — 사이트에서 관리자가 편집하면 자동 호출

## 비용 관리

- 호출 1건당 응답 1500토큰 + 웹검색 최대 5회로 제한돼 있어요.
- 모델은 기본 `claude-haiku-4-5`(가장 저렴). 더 정확하게 하려면 `wrangler.toml`의 `CLAUDE_MODEL`을
  `claude-opus-4-8`로 바꾸고 `npx wrangler deploy` 다시 실행. (비용은 몇 배 올라감)
- 비밀번호를 바꾸려면 `npx wrangler secret put GUILD_PASSWORD` 다시 실행 후 재배포.
- 검색을 잠시 막고 싶으면 Cloudflare 대시보드에서 이 Worker를 삭제하거나, 비밀번호를 바꾸면 됩니다.

## 주의

- 비밀번호는 운영진끼리만 공유하세요. 아는 사람은 누구나 검색을 돌릴 수 있어요(=크레딧 소모).
- API 키는 절대 `wrangler.toml`이나 코드에 적지 마세요. 반드시 위 2번처럼 `secret`으로만.
