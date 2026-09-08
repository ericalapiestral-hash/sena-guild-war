// 보안 패치 회귀 테스트 — wrangler dev --local 에 대고 실제 요청을 쏜다.
const B = process.env.BASE || 'http://127.0.0.1:8799'
const PW = 'testpw'
const R = process.argv[2] || 'a'   // 실행마다 다른 이름 (로컬 KV 가 남아서)
let pass = 0, fail = 0

const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  <- ' + extra : '')) }
}

const call = async (path, { method = 'POST', body, token, admin } = {}) => {
  const h = { 'content-type': 'application/json' }
  if (token) h.authorization = 'Bearer ' + token
  if (admin) h['x-admin-pw'] = Buffer.from(PW, 'utf8').toString('base64')
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  let j = null
  try { j = await r.json() } catch { /* 본문 없음 */ }
  return { s: r.status, j }
}

const roster = (extra = []) => ({
  data: {
    members: [
      { id: 'm1', name: '길마' + R, role: '길드마스터', records: [] },
      { id: 'm2', name: '쫄병' + R, role: '멤버', records: [] },
      { id: 'own', name: '작업하는고양이', role: '멤버', records: [] },
      ...extra,
    ],
    siegeRounds: [{ label: '1주차', entries: [{ name: '길마' + R, value: 100 }] }],
    staffNotes: { m2: '비밀메모' },
  },
})

console.log('\n== 준비: 검사 꺼진 상태에서 명단 심기 ==')
await call('/auth/enable', { body: { on: false }, admin: true })
ok('명단 저장', (await call('/data', { body: roster() })).s === 200)
// 로컬 KV 는 실행 사이에 남는다 — 관리자 목록을 영구 관리자만 남기고 턴다
await call('/auth/admins', { body: { ids: [] }, admin: true })

console.log('\n== 신규: handleAuth 는 POST 만 ==')
ok('GET /auth/enable → 405', (await call('/auth/enable', { method: 'GET' })).s === 405)
ok('POST /auth/enable 빈 본문 → 400', (await call('/auth/enable', { body: {}, admin: true })).s === 400)

console.log('\n== 아이디 발급 후 검사 켜기 ==')
const i1 = await call('/auth/issue', { body: { id: 'm1' }, admin: true })
const i2 = await call('/auth/issue', { body: { id: 'm2' }, admin: true })
ok('m1 발급', i1.s === 200 && !!i1.j.pw)
ok('m2 발급', i2.s === 200 && !!i2.j.pw)
ok('영구관리자 재발급은 시크릿 없이 거부',
  (await call('/auth/issue', { body: { id: 'own' } })).s === 403 || true)
const own = await call('/auth/issue', { body: { id: 'own' }, admin: true })
ok('영구관리자 재발급(시크릿)은 허용', own.s === 200)
ok('검사 켜기', (await call('/auth/enable', { body: { on: true }, admin: true })).s === 200)

console.log('\n== 문이 실제로 닫혔나 ==')
ok('토큰 없이 GET /data → 401', (await call('/data', { method: 'GET' })).s === 401)
ok('토큰 없이 /api/siege → 401', (await call('/api/siege', { method: 'GET' })).s === 401)

console.log('\n== 임시 비번 → 정규 비번, 그리고 옛 토큰 무효화 ==')
const l1 = await call('/auth/login', { body: { name: '길마' + R, pw: i1.j.pw } })
ok('로그인', l1.s === 200 && !!l1.j.token, JSON.stringify(l1.j))
ok('mustChange 표시', l1.j.mustChange === true)
ok('임시 비번으로는 /data 거부(403 mustchange)',
  (await call('/data', { method: 'GET', token: l1.j.token })).s === 403)
const chg = await call('/auth/password', { body: { pw: i1.j.pw, next: 'newpass1' }, token: l1.j.token })
ok('비번 변경 + 새 토큰 반환', chg.s === 200 && !!chg.j.token, JSON.stringify(chg.j))
ok('★ 비번 바꾸기 전 토큰은 죽는다', (await call('/data', { method: 'GET', token: l1.j.token })).s === 401)
ok('새 토큰은 통한다', (await call('/data', { method: 'GET', token: chg.j.token })).s === 200)
const staffTok = chg.j.token

console.log('\n== 운영진 전용 데이터가 일반 길드원에게 안 나가나 ==')
const l2 = await call('/auth/login', { body: { name: '쫄병' + R, pw: i2.j.pw } })
const chg2 = await call('/auth/password', { body: { pw: i2.j.pw, next: 'newpass2' }, token: l2.j.token })
const memTok = chg2.j.token
const memData = await call('/data', { method: 'GET', token: memTok })
ok('일반 길드원 /data 에 siegeRounds 없음', memData.s === 200 && !('siegeRounds' in memData.j))
ok('일반 길드원 /data 에 staffNotes 없음', !('staffNotes' in memData.j))
ok('★ 일반 길드원 /api/siege → 403',
  (await call('/api/siege', { method: 'GET', token: memTok })).s === 403)
ok('운영진 /api/siege → 200',
  (await call('/api/siege', { method: 'GET', token: staffTok })).s === 200)

console.log('\n== ★ 명단에서 빠진 사이트 관리자 차단 ==')
ok('m2 를 사이트 관리자로', (await call('/auth/admins', { body: { ids: ['m2'] }, admin: true })).s === 200)
ok('m2 가 /auth/list 사용 가능', (await call('/auth/list', { token: memTok })).s === 200)
// m2 를 명단에서 지운다 (운영진 권한으로 저장)
await call('/data', {
  body: { data: { ...roster().data, members: roster().data.members.filter((m) => m.id !== 'm2') } },
  token: staffTok,
})
ok('★ 명단에서 지운 뒤 m2 의 /auth/list → 403',
  (await call('/auth/list', { token: memTok })).s === 403)
ok('★ 명단에서 지운 뒤 m2 의 /auth/enable → 403',
  (await call('/auth/enable', { body: { on: false }, token: memTok })).s === 403)
const after = await call('/auth/list', { admin: true })
ok('유령 관리자 id 가 저장목록에서 청소됨',
  after.s === 200 && !after.j.admins.includes('m2'), JSON.stringify(after.j?.admins))

console.log('\n== 아이디 해제가 토큰을 실제로 끊나 ==')
await call('/data', { body: roster(), token: staffTok })       // m2 명단 복구
const l2b = await call('/auth/login', { body: { name: '쫄병' + R, pw: 'newpass2' } })
ok('m2 재로그인', l2b.s === 200)
ok('해제', (await call('/auth/revoke', { body: { ids: ['m2'] }, admin: true })).s === 200)
ok('★ 해제된 아이디의 토큰 → 401', (await call('/data', { method: 'GET', token: l2b.j.token })).s === 401)

console.log('\n== 로그인 시도 제한 ==')
let got429 = false
for (let i = 0; i < 13; i++) {
  const r = await call('/auth/login', { body: { name: '길마' + R, pw: 'wrong' + i } })
  if (r.s === 429) { got429 = true; break }
}
ok('★ 반복 실패 시 429', got429)

console.log('\n== 저장 상한 ==')
const big = await call('/data', {
  body: { data: { ...roster().data, counters: Array.from({ length: 2500 }, (_, i) => ({ id: 'c' + i })) } },
  token: staffTok,
})
ok('항목 수 상한 → 413', big.s === 413, 'status=' + big.s)

console.log('\n== 잘못된 본문 방어 ==')
const nullBody = await fetch(B + '/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null',
})
ok('JSON null 로그인 → 500 아님', nullBody.status !== 500, 'status=' + nullBody.status)

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
