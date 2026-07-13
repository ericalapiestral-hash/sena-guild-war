import { useState } from 'react'
import { INITIAL_GUIDES } from '../data/guide'
import { newId, update, useUserData } from '../store'
import { Markdown } from '../components/Markdown'

export function GuidePage() {
  const { customGuides } = useUserData()
  const sections = [...INITIAL_GUIDES, ...customGuides]
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  return (
    <div>
      <h1>공략 가이드</h1>
      <p className="page-desc">길드전 규칙과 운영 팁. 길드 자체 공략도 섹션으로 추가할 수 있어요.</p>

      <div className="toc">
        {sections.map((s) => (
          <button key={s.id} className="small" onClick={() => {
            document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
          }}>{s.title}</button>
        ))}
        <button className="small primary" onClick={() => setShowAdd(true)}>+ 섹션 추가</button>
      </div>

      {sections.map((s) => {
        const isCustom = customGuides.some((c) => c.id === s.id)
        return (
          <div className="card" key={s.id} id={s.id}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{s.title}</h2>
              {isCustom && (
                <button className="small danger" onClick={() => {
                  if (confirm(`'${s.title}' 섹션을 삭제할까요?`)) {
                    update((d) => { d.customGuides = d.customGuides.filter((g) => g.id !== s.id) })
                  }
                }}>삭제</button>
              )}
            </div>
            <Markdown text={s.body} />
          </div>
        )
      })}

      {showAdd && (
        <dialog open style={{ position: 'fixed', top: '8vh', zIndex: 100, left: '50%', transform: 'translateX(-50%)', margin: 0 }}>
          <h2 style={{ marginTop: 0 }}>가이드 섹션 추가</h2>
          <input placeholder="섹션 제목" value={title} onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }} />
          <textarea placeholder={'내용 — 간단 마크다운 지원:\n### 소제목\n- 리스트\n**강조**\n| 표 | 헤더 |'}
            value={body} onChange={(e) => setBody(e.target.value)}
            style={{ width: '100%', minHeight: 200 }} />
          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAdd(false)}>취소</button>
            <button className="primary" disabled={!title.trim() || !body.trim()} onClick={() => {
              update((d) => {
                d.customGuides.push({ id: newId('guide'), title: title.trim(), body })
              })
              setTitle(''); setBody(''); setShowAdd(false)
            }}>추가</button>
          </div>
        </dialog>
      )}
    </div>
  )
}
