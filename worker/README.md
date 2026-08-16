# 길드 공유 백엔드 (Cloudflare Worker)

길드원들이 같은 데이터를 보게 해주는 서버예요. 카운터덱·영웅·가이드·공성전/파괴신 기록을
Cloudflare KV에 저장하고, 캡처 판독(`/ocr`)과 라운지 공략 학습(`/learn`)도 여기서 돕니다.

**외부 API 키가 필요 없습니다.** AI 작업은 전부 Cloudflare Workers AI로 돌아가고,
비밀번호 시크릿도 쓰지 않아요. (예전 'AI 공략검색' 기능은 2026-07-14에 제거됐습니다.)

## 배포 (운영진 본인이 한 번만)

이 `worker` 폴더에서 순서대로 실행하세요. (`npx`라 따로 설치 안 해도 돼요.)

```bash
# 1) Cloudflare 로그인 (브라우저 창이 뜸 — 없으면 무료 가입)
npx wrangler login

# 2) 공유 데이터 저장용 KV 만들기 → 출력된 id 를 wrangler.toml 의 [[kv_namespaces]] id 에 붙여넣기
#    (이미 id가 채워져 있으면 건너뛰세요 — 새로 만들면 기존 데이터와 끊깁니다)
npx wrangler kv namespace create GUILD_KV

# 3) 배포
npx wrangler deploy
```

마지막에 `https://sena-guild-search.<계정>.workers.dev` 주소가 출력돼요.
그 주소를 `src/data/config.ts` 의 `WORKER_URL` 에 넣고 사이트를 재배포하면,
길드원 전원이 별도 설정 없이 같은 데이터를 봅니다.

> 사이트 배포(`./deploy.ps1`)와 워커 배포는 **별개**예요.
> 이 폴더 파일을 고친 날은 `npx wrangler deploy` 를 따로 실행해야 반영됩니다.

## 엔드포인트

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| `GET`  | `/data` | 공유 데이터 조회 (누구나) |
| `POST` | `/data` | 공유 데이터 갱신 `{data}` — 사이트에서 편집하면 자동 호출 |
| `GET`  | `/data/prev` | 직전 백업본 (10분에 1번) — 실수 복구용 |
| `GET`  | `/data/daily` | 일별 백업본 (하루 1번) — 오염·장난 복구용 |
| `POST` | `/ocr` | 결과 화면 캡처에서 점수·순위 판독 |
| `POST` | `/learn` | 네이버 라운지 새 공략 수집·분류·요약 (10분에 1번 제한) |
| `GET`  | `/learn/latest` | 마지막 학습 결과 |
| `GET`  | `/api/siege?week=&day=` | 공성전 통계 (읽기 전용) |
| `GET`  | `/api/destroyer?season=` | 파괴신 통계 (읽기 전용) |

**`POST /data` 는 비밀번호가 없습니다.** 덱·가이드 편집은 길드원 누구나 할 수 있게
공개로 열어둔 것이고, 관리자 비번(`src/data/config.ts` 의 `ADMIN_PW_HASH`)은
[길드원]·[데이터] 페이지 접근을 막는 용도로만 씁니다.

## 안전장치

- **크기 제한** — `POST /data` 는 1MB 초과 시 거부 (실데이터는 수십 KB 수준).
- **형식 검증** — 배열이어야 하는 필드가 깨져 오면 저장 거부. 깨진 데이터가 들어가면
  전 길드원 사이트가 안 열립니다.
- **버전(`_rev`)** — KV는 최종 일관성이라 오래된 데이터가 읽힐 수 있어요.
  서버가 스탬프한 rev로 비교해 최신 편집이 덮어써지지 않게 합니다.
- **백업 2단** — `/data/prev`(10분) · `/data/daily`(하루). 사고 나면 여기서 복구하세요.
- **브라우저 밖 push 차단** — `src/store.ts` 가 `window` 없는 환경(Node 등)과 localhost에서는
  업로드를 무조건 막습니다. 실제로 Node 테스트가 전 길드 데이터를 덮어쓴 사고가 있었어요
  (2026-08-14, 백업으로 복구). **이 가드를 우회하지 마세요.**

## 비용

Workers AI 무료 할당량(하루 10,000뉴런) 안에서 동작하도록 맞춰져 있어요.

- `/learn` 은 10분에 1번으로 제한되고, 한 번에 새 글 6개 · 글당 이미지 3장까지만 읽습니다.
- 할당량이 부족하면 `worker.js` 의 `LEARN_MAX_POSTS` · `LEARN_MAX_IMAGES` 를 줄이세요.
