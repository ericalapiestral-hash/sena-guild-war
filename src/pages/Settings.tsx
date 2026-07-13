import { useRef, useState } from 'react'
import { exportJson, importJson, resetAll, useUserData } from '../store'

export function SettingsPage() {
  useUserData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sena-guild-war-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('내보내기 완료 — 다운로드 폴더를 확인하세요.')
  }

  function onFile(f: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const res = importJson(String(reader.result))
      setMsg(res.ok ? '가져오기 완료!' : `가져오기 실패: ${res.error}`)
    }
    reader.readAsText(f)
  }

  return (
    <div>
      <h1>데이터 관리</h1>
      <p className="page-desc">
        직접 입력한 데이터(카운터, 덱, 길드원, 가이드)는 이 브라우저의 저장소에 보관됩니다.
        백업하거나 다른 기기·길드원에게 옮길 때 여기를 사용하세요.
      </p>

      <div className="card">
        <strong>내보내기</strong>
        <p className="muted">현재 데이터 전체를 JSON 파일로 다운로드합니다.</p>
        <button className="primary" onClick={download}>JSON 내보내기</button>
      </div>

      <div className="card">
        <strong>가져오기</strong>
        <p className="muted">내보냈던 JSON 파일을 불러옵니다. 현재 브라우저의 데이터를 덮어씁니다.</p>
        <input ref={fileRef} type="file" accept=".json,application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </div>

      <div className="card">
        <strong style={{ color: 'var(--danger)' }}>초기화</strong>
        <p className="muted">직접 입력한 데이터를 모두 지우고 기본 데이터만 남깁니다.</p>
        <button className="danger" onClick={() => {
          if (confirm('정말 모든 사용자 데이터를 삭제할까요? 되돌릴 수 없습니다.')) {
            resetAll()
            setMsg('초기화 완료')
          }
        }}>전체 초기화</button>
      </div>

      {msg && <div className="card" style={{ borderColor: 'var(--accent-dim)' }}>{msg}</div>}
    </div>
  )
}
