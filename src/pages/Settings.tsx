import { useEffect, useRef, useState } from 'react'
import { DEFAULT_GUILD_NAME, exportJson, importJson, resetAll, setGuildName, todayLocal, useGuildName, useUserData } from '../store'
import { LearnBriefing } from '../components/LearnBriefing'

export function SettingsPage() {
  useUserData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const guildName = useGuildName()
  const [nameDraft, setNameDraft] = useState(guildName)
  // 저장 후, 또는 다른 운영진이 바꿔 공유 데이터가 갱신되면 입력칸을 맞춘다
  useEffect(() => { setNameDraft(guildName) }, [guildName])

  function saveName() {
    const v = nameDraft.trim()
    if (v === guildName) return
    setGuildName(v)
    setMsg(v ? `길드 이름을 '${v}'로 바꿨어요.` : `길드 이름을 기본값(${DEFAULT_GUILD_NAME})으로 되돌렸어요.`)
  }

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sena-guild-war-${todayLocal()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('내보내기 완료 — 다운로드 폴더를 확인하세요.')
  }

  function onFile(f: File) {
    // ★ 이건 '내 브라우저에서 열어보기'가 아니다. importJson 이 끝에 push() 를 불러
    //   길드 공유 저장소를 이 파일 내용으로 통째로 바꾼다 — 전 길드원의 공성전·
    //   파괴신 기록과 명단이 이 파일 시점으로 되돌아간다. 묻고 나서 한다.
    if (!confirm(
      `길드 공유 데이터를 "${f.name}" 의 내용으로 통째로 바꿉니다.\n\n` +
      '내 브라우저만이 아니라 길드원 전원이 보는 기록(공성전·파괴신·명단·카운터덱)이 ' +
      '이 파일 시점으로 되돌아갑니다.\n\n계속할까요?',
    )) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const res = importJson(String(reader.result))
      setMsg(res.ok ? '가져오기 완료 — 공유 저장소에 반영했어요.' : `가져오기 실패: ${res.error}`)
    }
    reader.readAsText(f)
  }

  return (
    <div>
      <h1>데이터 관리</h1>
      <p className="page-desc">
        직접 입력한 데이터(카운터, 덱, 길드원, 가이드)는 길드 공유 저장소에 보관되고,
        연결이 없으면 이 브라우저에만 남습니다. 백업하거나 배포본 기본값으로 올릴 때 여기를 사용하세요.
      </p>

      <div className="card">
        <strong>길드 이름</strong>
        <p className="muted">
          왼쪽 위 로고, 홈 제목, 화면 아래 문구, 통계 인쇄표, 브라우저 탭에 함께 나옵니다.
          비워두면 기본값(<b>{DEFAULT_GUILD_NAME}</b>)으로 돌아가요.
        </p>
        <div className="row">
          <input
            value={nameDraft}
            maxLength={16}
            placeholder={DEFAULT_GUILD_NAME}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName() }}
            style={{ flex: 1, minWidth: 140, maxWidth: 260 }}
          />
          <button className="primary" disabled={nameDraft.trim() === guildName} onClick={saveName}>변경</button>
          {guildName !== DEFAULT_GUILD_NAME && (
            <button className="small" onClick={() => { setNameDraft(''); setGuildName(''); setMsg(`길드 이름을 기본값(${DEFAULT_GUILD_NAME})으로 되돌렸어요.`) }}>
              기본값으로
            </button>
          )}
        </div>
      </div>

      <LearnBriefing />

      <div className="card">
        <strong>내보내기</strong>
        <p className="muted">현재 데이터 전체를 JSON 파일로 다운로드합니다.</p>
        <button className="primary" onClick={download}>JSON 내보내기</button>
      </div>

      <div className="card">
        <strong>가져오기</strong>
        <p className="muted">
          내보냈던 JSON 파일을 불러옵니다.
          <b style={{ color: 'var(--danger)' }}> 길드 공유 데이터를 이 파일로 통째로 바꿉니다</b>
          {' '}— 내 브라우저만이 아니라 길드원 전원의 기록이 이 파일 시점으로 되돌아갑니다.
        </p>
        <input ref={fileRef} type="file" accept=".json,application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </div>

      <div className="card">
        <strong style={{ color: 'var(--danger)' }}>초기화</strong>
        <p className="muted">
          직접 입력한 데이터를 모두 지우고 기본 데이터만 남깁니다.
          <b style={{ color: 'var(--danger)' }}> 길드 공유 저장소에서 지웁니다</b>
          {' '}— 길드원 전원의 공성전·파괴신 기록과 명단이 함께 사라집니다.
        </p>
        <button className="danger" onClick={() => {
          // 확인창이 '내 데이터'처럼 읽혀서 위험이 전달되지 않았다. 무엇이 사라지는지 적는다.
          if (confirm(
            '길드 공유 저장소의 데이터를 전부 지웁니다.\n\n' +
            '공성전·파괴신 기록, 길드원 명단, 카운터덱, 길드전 세팅이 길드원 전원에게서 사라집니다.\n' +
            '되돌리려면 운영진이 백업(직전본/일별본)에서 복구해야 합니다.\n\n정말 진행할까요?',
          )) {
            resetAll()
            setMsg('초기화 완료 — 공유 저장소에서 지웠어요.')
          }
        }}>전체 초기화</button>
      </div>

      {msg && <div className="card" style={{ borderColor: 'var(--accent-dim)' }}>{msg}</div>}
    </div>
  )
}
