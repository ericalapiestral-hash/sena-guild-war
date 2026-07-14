// 관리자(운영진) 로그인 비밀번호의 SHA-256 해시. 평문은 소스에 남지 않아요.
// 비번 변경 시 아래 해시를 새 값으로 교체:
//   node -e "console.log(require('crypto').createHash('sha256').update('새비번').digest('hex'))"
export const ADMIN_PW_HASH = 'a5dc6c6f3e1625157b655547f5ffc74de885e87568038fc9097a99bc60629051'

// 배포된 Cloudflare Worker 주소 (공유 데이터 열람용).
// 워커를 배포한 뒤 그 주소를 여기에 넣으면, 길드원 전원이 별도 설정 없이 운영진이 등록한 덱을 봐요.
// 예: 'https://sena-guild-search.<계정>.workers.dev'
// 비워두면 각자 브라우저에만 저장되는 로컬 모드로 동작.
export const WORKER_URL: string = 'https://sena-guild-search.ericalapiestral.workers.dev'
