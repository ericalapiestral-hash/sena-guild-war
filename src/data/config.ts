// 배포된 Cloudflare Worker 주소 (실시간 전황·AI 검색 공유용).
// 워커를 배포한 뒤 그 주소를 여기에 넣으면, 길드원 전원이 별도 설정 없이 실시간 전황을 볼 수 있어요.
// 예: 'https://sena-guild-search.<계정>.workers.dev'
// 비워두면 [실시간 전황] 페이지에서 각자 주소를 입력하는 방식으로 동작(폴백).
export const WORKER_URL: string = ''
