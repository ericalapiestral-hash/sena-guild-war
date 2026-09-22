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
ok('자격 없이 발급 시도 → 403',
  (await call('/auth/issue', { body: { id: 'own' } })).s === 403)
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

console.log('\n== ★ 신규: 이번 감사에서 나온 구멍들 ==')
// W2 — members 를 통째로 빼면 명단이 사라져 전원(영구 관리자 포함)이 잠겼다
ok('★ members 를 빼고 저장해도 명단이 남는다',
  (await call('/data', { body: { data: {} }, token: staffTok })).s === 200)
const kept = await call('/data', { method: 'GET', token: staffTok })
ok('★ 명단이 그대로다', Array.isArray(kept.j?.members) && kept.j.members.length === 3,
  JSON.stringify(kept.j?.members?.length))
// W1 — 중첩 배열 검증
ok('★ counters 안의 counters:null → 400',
  (await call('/data', {
    body: { data: { counters: [{ id: 'x', defense: [], counters: null }] } }, token: memTok,
  })).s === 400)
ok('정상 중첩은 통과', (await call('/data', {
  body: { data: { counters: [{ id: 'x', defense: [], counters: [] }] } }, token: memTok,
})).s === 200)
// W5 — 일반 길드원이 칸을 부풀려 저장본을 막는 것
ok('★ 일반 길드원의 거대한 칸 → 413', (await call('/data', {
  body: { data: { counters: [{ id: 'big', defense: [], counters: [], memo: 'A'.repeat(250_000) }] } },
  token: memTok,
})).s === 413)
await call('/data', { body: { data: roster().data }, token: staffTok })   // 원복
// W4 — /learn/latest 가 관문 밖에 있어 인터넷 누구나 브리핑을 읽었다
ok('★ /learn/latest 토큰 없이 → 401',
  (await call('/learn/latest', { method: 'GET' })).s === 401)
ok('★ /learn/latest 일반 길드원 → 403',
  (await call('/learn/latest', { method: 'GET', token: memTok })).s === 403)
ok('/learn/latest 운영진 → 200',
  (await call('/learn/latest', { method: 'GET', token: staffTok })).s === 200)

console.log('\n== ★ 운영진 전용 칸은 요청에서 빠져도 이월된다 ==')
// 권한이 막 바뀐 클라이언트는 siegeRounds 가 없는 stripped 사본을 들고 있다.
// 그 상태로 저장해도 과거 회차가 날아가면 안 된다.
await call('/data', { body: { data: { members: roster().data.members } }, token: staffTok })
const carried = await call('/data', { method: 'GET', token: staffTok })
ok('★ 요청에서 빠진 siegeRounds 가 살아남는다',
  Array.isArray(carried.j?.siegeRounds) && carried.j.siegeRounds.length === 1,
  JSON.stringify(carried.j?.siegeRounds))
ok('요청에서 빠진 staffNotes 도 살아남는다', carried.j?.staffNotes?.m2 === '비밀메모')
// 그래도 '빈 배열을 보내는 것'은 통해야 한다 — [전체 초기화]가 그 경로다
await call('/data', { body: { data: { ...roster().data, siegeRounds: [] } }, token: staffTok })
const cleared = await call('/data', { method: 'GET', token: staffTok })
ok('★ 빈 배열을 명시하면 실제로 비워진다',
  Array.isArray(cleared.j?.siegeRounds) && cleared.j.siegeRounds.length === 0,
  JSON.stringify(cleared.j?.siegeRounds))
await call('/data', { body: { data: roster().data }, token: staffTok })   // 뒷 테스트를 위해 원복

console.log('\n== ★ 명단에서 빠진 사이트 관리자 차단 ==')
ok('m2 를 사이트 관리자로', (await call('/auth/admins', { body: { ids: ['m2'] }, admin: true })).s === 200)
ok('m2 가 /auth/list 사용 가능', (await call('/auth/list', { token: memTok })).s === 200)
// ★ 사이트 관리자여도 영구 관리자 비번은 못 건드린다 — 재발급은 곧 계정 인수다.
//   토큰만으로 부르면 worker 의 ownerId 가드(handleAuth 의 /auth/issue)에 걸려야 한다.
//   위의 '자격 없이' 케이스는 그 앞의 관리자 관문에서 먼저 막혀 여기까지 안 온다.
ok('★ 사이트 관리자라도 영구관리자 재발급은 시크릿 없이 거부',
  (await call('/auth/issue', { body: { id: 'own' }, token: memTok })).s === 403)
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
// 목록에서 지우지는 않는다 — 운영진이 members 만 고쳐도 다른 관리자를 영구 강등시킬
// 수 있었기 때문이다. 대신 힘이 없고(위 403 둘), 화면에서 정리하게 표시해 준다.
ok('★ 유령 관리자 id 는 목록에 남아도 힘이 없다(ghostAdmins 로 표시)',
  after.s === 200 && Array.isArray(after.j?.ghostAdmins) && after.j.ghostAdmins.includes('m2'),
  JSON.stringify(after.j?.ghostAdmins))

console.log('\n== ★ 외부 처리는 계정 정지가 아니다 ==')
// 외부 처리는 '집계에서 뺀다' 는 뜻이다. 관리자가 자리 때문에 잠깐 명단에서
// 내려가 있는 동안 사이트를 통째로 못 쓰게 되면 명단을 되돌릴 사람이 없어진다.
//
// ★ POST /data 는 guard() 를 타므로 x-admin-pw 로는 못 쓴다 — 토큰으로 보내야 한다.
//   (처음에 admin:true 로 보냈다가 저장이 안 돼서 테스트가 헛돌았다)
{
  const exRoster = (mut) => ({ data: { ...roster().data, members: roster().data.members.map(mut) } })
  // m1(길마·운영진)은 아직 사이트 관리자가 아니다 → 외부 처리하면 예전처럼 막혀야 한다
  ok('외부 처리 저장',
    (await call('/data', {
      body: exRoster((m) => (m.id === 'm1' ? { ...m, excluded: true } : m)), token: staffTok,
    })).s === 200)
  ok('★ 외부 처리된 일반 계정은 여전히 차단',
    (await call('/data', { method: 'GET', token: staffTok })).s === 403)
  ok('★ 외부 처리된 일반 계정은 로그인도 거부',
    (await call('/auth/login', { body: { name: '길마' + R, pw: 'newpass1' } })).s === 401)
  // 시크릿으로 사이트 관리자로 올린다 (/auth/* 는 x-admin-pw 로 통한다)
  ok('m1 을 사이트 관리자로', (await call('/auth/admins', { body: { ids: ['m1'] }, admin: true })).s === 200)
  ok('★ 외부 처리된 사이트 관리자는 통과',
    (await call('/data', { method: 'GET', token: staffTok })).s === 200)
  ok('★ 외부 처리된 사이트 관리자는 로그인도 된다',
    (await call('/auth/login', { body: { name: '길마' + R, pw: 'newpass1' } })).s === 200)
  ok('★ 외부 처리된 사이트 관리자는 /auth/list 도 쓴다',
    (await call('/auth/list', { token: staffTok })).s === 200)
  // 원복 — 이제 m1 이 통하므로 자기 토큰으로 되돌릴 수 있다
  await call('/data', { body: { data: roster().data }, token: staffTok })
  await call('/auth/admins', { body: { ids: [] }, admin: true })
  ok('원복 후 정상', (await call('/data', { method: 'GET', token: staffTok })).s === 200)
}

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

console.log('\n== 2차 패치 ==')
// 오염 원소 하나로 전원 화면이 죽던 것
const poisoned = await call('/data', {
  body: { data: { ...roster().data, counters: [null] } }, token: staffTok,
})
ok('★ counters:[null] → 400', poisoned.s === 400, 'status=' + poisoned.s)

// 영구 관리자를 명단에서 밀어내기
const kick = await call('/data', {
  body: { data: { ...roster().data, members: roster().data.members.filter((m) => m.id !== 'own') } },
  token: staffTok,
})
ok('★ 영구 관리자 명단에서 제거 → 403', kick.s === 403, 'status=' + kick.s)
const excl = await call('/data', {
  body: {
    data: {
      ...roster().data,
      members: roster().data.members.map((m) => (m.id === 'own' ? { ...m, excluded: true } : m)),
    },
  },
  token: staffTok,
})
ok('★ 영구 관리자 외부처리 → 403', excl.s === 403, 'status=' + excl.s)

// 본문을 읽기 전에 크기로 자르는가
const huge = await fetch(B + '/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'x'.repeat(40000), pw: 'y' }),
})
ok('★ 과대 본문 로그인 → 413', huge.status === 413, 'status=' + huge.status)

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
