# CLAUDE.md — 세나 리버스 길드전 도우미

> 이 파일은 포맷으로 날아간 대화 기록을 대신해, 저장소 현재 상태(README·git 로그·소스 구조)에서 복원한 프로젝트 맥락입니다. 사실과 다른 부분이 있으면 바로 고쳐 주세요.

## 이 프로젝트가 뭔가

세븐나이츠 리버스 **길드전 공략 공유 사이트**. 길드원들이 같이 보는 웹앱이고, 정적 빌드라 아무 정적 호스팅에나 올라간다. 데이터 공유·학습(AI 요약) 부분만 Cloudflare Worker가 뒤를 받친다.

패키지명 `sena-guild-war`.

## 스택

- Vite 6 + React 18 + TypeScript (`tsc -b && vite build`)
- 라우팅은 라이브러리 없이 `src/router.ts` 자체 구현
- `tesseract.js` — 게임 화면 캡처에서 점수/순위 OCR 읽기
- `html2canvas` — 화면 이미지 내보내기
- Cloudflare Worker (`worker/worker.js`) + KV — 공유 데이터 저장, 학습 API

## 명령어

```bash
npm install
npm run dev       # 개발 서버
npm run build     # dist/ 정적 빌드
npm run preview
./deploy.ps1      # 배포 스크립트 (Windows PowerShell)
```

Worker는 `worker/` 에서 wrangler로 따로 배포한다.

## 구조

```
src/
  App.tsx          셸 · 네비게이션 (18KB, 큰 편)
  router.ts        자체 라우터
  store.ts         전역 상태 + 저장소 (localStorage / 공유 KV)
  types.ts         공용 타입
  auth.ts          관리자 로그인
  styles.css       전체 스타일 (68KB — 단일 파일)
  pages/           Home Arena Counters Cutlines Guide Heroes Members Settings Stats AdminLogin
  components/      HeroSelect Modal ScoreImport Icon Markdown ErrorBoundary
  lib/
    ocr.ts         캡처 → 점수표 인식 (31KB, 핵심 로직)
    stat.tsx       통계 표시 헬퍼
    useMediaQuery.ts
  data/            heroes.json counters.json arena.json guide.ts heroRecs.ts destroyerGuide.ts config.ts
worker/
  worker.js        API + KV 저장 + 학습(요약) 엔드포인트 (43KB)
  wrangler.toml
tools/             보조 스크립트
```

## 알아둘 것

- **AI 공략검색 기능은 없다.** 2026-07-14에 워커에서 제거했고, 2026-08-16에 남아 있던 잔재(문서·`SEARCH_CFG` localStorage 설정·로그인 안내 문구)까지 정리했다. 워커는 **외부 API 키를 쓰지 않는다** — AI는 전부 Workers AI(`env.AI`). 시크릿·vars 추가할 일이 생기면 정말 필요한지 먼저 의심할 것.
- **공유 저장소 push는 브라우저에서만 허용된다.** Node 등 브라우저 밖 실행에서는 무조건 차단되도록 막아뒀다 (실수로 로컬 스크립트가 공유 데이터를 덮어쓰는 사고 방지). 이 가드를 우회하지 말 것.
- **학습(/learn) 파이프라인** — 라운지의 새 공략 글을 모아 분류·요약하고, 글 안의 덱 스크린샷까지 비전 모델로 읽어 덱 구성을 뽑는다. 규칙 두 가지가 중요:
  - 비길드전 글은 **읽기 경로에서도** 분류 필터를 한 번 더 건다. KV 캐시가 오래 남아 있어도 안전하도록 이중으로 거르는 구조다.
  - 제외 판정된 글은 이월분(캐리오버)에서도 제거한다.
  - 덱 추출은 같은 구성이 반복 저장되지 않게 중복 제거를 거친다.
- 학습 브리핑 UI는 홈에서 내렸다가(31007dd) **운영진 전용 [데이터] 페이지로 옮겨 붙였다**(2026-08-16). 그 사이 프론트에 트리거가 하나도 없어서 `/learn`이 아무도 안 돌리는 상태였다. **홈에는 다시 걸지 말 것** — 오분류 글 하나가 길드원 전원에게 그대로 노출된다.
- **학습은 이제 사람 손을 안 탄다** — 워커 cron(`wrangler.toml`의 `[triggers] crons = ["0 21 * * *"]`, 매일 06:00 KST)이 돌린다. Cloudflare cron은 UTC 기준이니 시간 고칠 때 주의. 학습 본체는 `runLearn()`으로 빠져 있고 HTTP(`handleLearn`)와 cron(`learnCron`)이 같이 쓴다 — **origin 검사는 HTTP 경로에만** 있어야 한다(cron엔 origin이 없다).
  - cron에는 브라우저가 없어 영웅 로스터를 못 받는다. 운영진이 버튼으로 학습할 때 KV `learn-heroes`에 캐시해 두고 그걸 쓴다. 로스터가 비면 **신규 영웅 판별을 건너뛴다** — 안 그러면 아는 영웅이 전부 신규로 뜬다.
  - 실행 기록은 KV `learn-cron` → `GET /learn/latest`의 `cron` 필드 → [데이터] 페이지에 표시. 이틀 넘게 안 돌면 빨간 경고. 루틴이 조용히 죽는 걸 막으려고 넣은 장치다.
- **길드원 '외부 처리'(`Member.excluded`)** — 자리 때문에 들락날락하는 계정을 삭제하지 않고 명단에서만 내리는 장치. 판정은 `store.ts`의 `activeMembers`/`rosterNames`로 모아 뒀다.
  - 핵심 규칙: **명단('누가 있어야 하는가')만 바꾸고 기록('누가 몇 점을 냈는가')은 안 건드린다.** 점수는 `StatRound.entries/days`에 이름으로 저장돼 있어서, 제외해도 지난 회차 표에 `(외부)` 라벨로 그대로 남는다. 여기서 사람을 지우면 과거 표가 거짓이 된다.
  - 그래서 제외한 계정은 **점수가 있으면 `(외부)` 행으로 남고, 없으면 명단에서 사라진다** — 기존 '길드원+외부' 병합 경로(`buildRanked`)를 그대로 탄다.
  - 캡처 판독에는 외부 계정 이름도 후보로 넘긴다(복귀 처리를 깜빡해도 오인식 안 나게). 단 '아직 안 나온 사람' 집계에는 안 넣는다.
- 캡처 입력(ScoreImport)은 **여러 장 이어 붙이기**를 지원하고, 하단의 본인 행은 자동 제외한다. 캡처 입력이 생기면서 소탕 버튼은 제거했다.
  - 공성전·파괴신이 같은 `EntryTable`을 쓴다. **파괴신은 넣을 칸이 둘**(`mid` 중간집계 / `value` 최종)이라 `targets`로 골라 넣는다 — 안 물어보면 시즌 도중 캡처가 최종으로 잘못 들어가 순위·미달이 통째로 어긋난다. 공성전은 칸이 하나라 선택지를 숨긴다.
  - 수치 이름(`metric`: '점수'/'딜량')을 워커 `/ocr` 프롬프트까지 넘긴다. **클라이언트 문자열을 그대로 프롬프트에 넣지 말 것** — `OCR_METRICS` 화이트리스트로 거른다.
  - 한국어 조사는 `josa()`로 받침을 보고 고른다(점수**를** / 딜량**을**). 프론트·워커 양쪽에 같은 함수가 있다.
- 커트라인은 **공성전 요일별 / 파괴신 파이 초월별** 기준 메뉴로 나뉜다.
- 초기 데이터는 `src/data/*.json`. 사이트에서 입력한 데이터를 [데이터 관리]에서 JSON으로 내보내 이 파일에 반영하면 배포본 기본값으로 승격된다.

## 최근 작업 흐름 (git 로그 기준, 최신순)

길드원 외부 처리(들락날락 계정) → 학습 자동 루틴(cron) 도입 → AI 검색 잔재 정리 + 학습 브리핑 [데이터]로 복귀 → 소탕 버튼 제거 → 브라우저 밖 push 차단 → 커트라인 기준 메뉴 → 덱 추출 중복 제거 → 학습 성능 개선(모델 상향 + 전면 병렬화) → 학습 v2(스크린샷 비전 분석) → 학습 브리핑 홈에서 내림 → 학습 API(/learn) 도입 → 캡처 여러 장 이어 붙이기

## 코드 스타일

- 한국어 커밋 메시지, 한국어 UI 문구, 한국어 주석
- 파일명은 영어(PascalCase 컴포넌트), 도메인 데이터 키는 한국어가 섞여 있음
- 상태는 `store.ts` 한 곳에 모으는 방식 — 컴포넌트에 흩뿌리지 않는다
