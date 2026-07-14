// 관리자(운영진) 로그인 비밀번호의 SHA-256 해시. 평문은 소스에 남지 않아요.
// 비번 변경 시 아래 해시를 새 값으로 교체:
//   node -e "console.log(require('crypto').createHash('sha256').update('새비번').digest('hex'))"
export const ADMIN_PW_HASH = 'a5dc6c6f3e1625157b655547f5ffc74de885e87568038fc9097a99bc60629051'
