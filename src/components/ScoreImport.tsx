import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { matchName, readImage, type OcrRow } from '../lib/ocr'

/**
 * 결과 화면 캡처에서 닉네임·점수를 읽어 채우는 창.
 *
 * OCR은 틀릴 수 있으므로 **바로 반영하지 않는다**. 읽은 결과를 표로 보여주고,
 * 사람이 이름·점수를 고친 뒤 [적용]을 눌러야 입력칸에 들어간다.
 * 적용해도 아직 편집 중 상태라, 최종 반영은 기존처럼 [저장]을 눌러야 한다.
 */
export function ScoreImport({
  roster,
  metric,
  onApply,
  onClose,
}: {
  roster: string[]
  metric: string
  onApply: (values: Array<{ name: string; value: number }>) => void
  onClose: () => void
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<OcrRow[] | null>(null)
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 미리보기 URL 정리
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }, [imgUrl])

  async function run(file: Blob) {
    setError('')
    setRows(null)
    setBusy(true)
    setProgress(0)
    setStatus('준비 중')
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    setImgUrl(URL.createObjectURL(file))
    try {
      const { rows: r, text } = await readImage(file, roster, (p) => {
        setProgress(p.progress)
        setStatus(p.status)
      })
      setRawText(text)
      setRows(r)
      if (r.length === 0) setError('이름과 점수를 찾지 못했어요. 표가 크게 나오도록 잘라서 다시 올려보세요.')
    } catch (e) {
      setError(
        '글자를 읽는 데 실패했어요. 인터넷 연결을 확인해 주세요 — 처음 한 번은 한국어 인식 데이터를 내려받습니다. (' +
          (e instanceof Error ? e.message : String(e)) +
          ')',
      )
    } finally {
      setBusy(false)
    }
  }

  // 붙여넣기(Ctrl+V)로 바로 받기
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) { e.preventDefault(); void run(file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // run은 매 렌더 새로 만들어지지만 내부에서 최신 roster를 쓰므로 재등록 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setRow = (i: number, patch: Partial<OcrRow>) =>
    setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, ...patch } : r)) : prev))

  const usable = (rows ?? []).filter((r) => r.matched && typeof r.score === 'number')
  // 같은 사람이 두 번 잡히면 뒤엣것이 덮어써서 조용히 틀릴 수 있으니 미리 알린다
  const dupes = [...new Set(usable.map((r) => r.matched).filter((n, i, a) => a.indexOf(n) !== i))]

  return (
    <Modal
      title="캡처에서 점수 읽기"
      desc="공성전 결과 화면을 캡처해 올리면 닉네임과 점수를 읽어 입력칸을 채웁니다."
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose}>취소</button>
          <button
            className="primary"
            disabled={usable.length === 0}
            onClick={() => {
              onApply(usable.map((r) => ({ name: r.matched as string, value: r.score as number })))
              onClose()
            }}
          >
            {usable.length > 0 ? `${usable.length}명 적용` : '적용'}
          </button>
        </>
      }
    >
      {!rows && (
        <div
          className={`ocr-drop ${busy ? 'busy' : ''}`}
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f && f.type.startsWith('image/')) void run(f)
          }}
        >
          <div className="ocr-drop-ic" aria-hidden>🖼</div>
          <strong>캡처 이미지를 여기에 끌어다 놓거나 클릭해서 고르세요</strong>
          <span className="muted">Ctrl+V 로 붙여넣어도 됩니다</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f) }}
          />
        </div>
      )}

      {busy && (
        <div className="ocr-progress">
          <div className="ocr-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span className="muted">{status} {Math.round(progress * 100)}%</span>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
            처음 한 번은 한국어 인식 데이터를 내려받느라 조금 걸립니다.
          </p>
        </div>
      )}

      {error && <p className="ocr-error">{error}</p>}

      {imgUrl && rows && (
        <details className="fdetails">
          <summary>올린 이미지 보기</summary>
          <img src={imgUrl} alt="올린 캡처" className="ocr-preview" />
        </details>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="hint-row">
            {usable.length}명 인식 · <b>이름이나 점수가 틀렸으면 여기서 고친 뒤 적용하세요.</b>
          </div>
          {dupes.length > 0 && (
            <p className="ocr-error">같은 사람이 여러 줄에 잡혔어요: {dupes.join(', ')} — 하나만 남기고 [건너뜀]으로 바꿔주세요.</p>
          )}
          <div className="table-wrap ocr-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>읽은 줄</th>
                  <th>길드원</th>
                  <th style={{ textAlign: 'right', width: 130 }}>{metric}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.matched ? '' : 'row-fail'}>
                    <td className="ocr-raw">{r.raw}</td>
                    <td>
                      <select
                        value={r.matched ?? ''}
                        onChange={(e) => setRow(i, { matched: e.target.value || undefined, confidence: e.target.value ? 1 : 0 })}
                      >
                        <option value="">— 건너뜀 —</option>
                        {roster.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      {r.matched && r.confidence < 0.85 && (
                        <em className="ocr-warn" title="글자가 정확히 일치하지 않아 비슷한 이름으로 맞춘 것">확인 필요</em>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        className="num-tab"
                        value={r.score ?? ''}
                        placeholder="0"
                        onChange={(e) => setRow(i, { score: e.target.value === '' ? undefined : Number(e.target.value) })}
                        style={{ width: 120, textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="fdetails" open={showRaw} onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}>
            <summary>읽은 원문 전체 (잘 안 맞을 때 확인용)</summary>
            <pre className="ocr-rawtext">{rawText}</pre>
          </details>

          <button className="small" style={{ marginTop: 10 }} onClick={() => { setRows(null); setError('') }}>
            다른 이미지로 다시 하기
          </button>
        </>
      )}
    </Modal>
  )
}

/** 이름만 따로 맞춰볼 때 (테스트·디버그용으로 내보냄) */
export { matchName }
