// 관리자(운영진) 로그인 비밀번호의 SHA-256 해시. 평문은 소스에 남지 않아요.
// 임시 비번: "nangman" — 원하는 비번으로 바꾸려면 아래 해시를 새 값으로 교체(요청 시 대신 계산해 드림).
//   node -e "console.log(require('crypto').createHash('sha256').update('새비번').digest('hex'))"
export const ADMIN_PW_HASH = '21fdf28c1a190b4b29e3f3e8f0a26178f7774550fa3e29ba1cb51eb41f4ec965'
