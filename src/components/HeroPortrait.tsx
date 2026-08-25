import { useState } from 'react'
import type { Hero } from '../types'

/**
 * 영웅 초상화.
 *
 * 파일은 public/heroes/{영웅 id}.png|webp 에 있다. 파일명은 글자·숫자만 남기고
 * 나머지는 밑줄로 바꿔 저장했다 — '브란즈&브란셀'의 & 가 URL에서 걸려서 안 뜨던 적이 있다.
 * 이미지가 없는 영웅(클레오 등)이나 사용자가 직접 추가한 영웅은 이름 첫 글자로 대체한다 —
 * 깨진 이미지 아이콘이 뜨는 것보다 낫다.
 *
 * 그림이 실제로 도움이 되는 자리(슬롯·선택 모달)에만 쓴다. 덱 한 줄처럼 이름이
 * 촘촘히 이어지는 곳에는 넣지 않는다 — 목록이 무거워지고 읽기 나빠진다.
 */
export function HeroPortrait({
  hero,
  name,
  size = 34,
}: {
  hero?: Hero
  name: string
  /** 한 변 픽셀 */
  size?: number
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const id = hero?.id ?? name
  const file = encodeURIComponent(id.replace(/[^\p{L}\p{N}]+/gu, '_'))
  const bases = [`heroes/${file}.png`, `heroes/${file}.webp`]
  // png → webp 순으로 시도하고, 둘 다 없으면 글자로 떨어진다
  const src = failed === bases[0] ? bases[1] : bases[0]
  const dead = failed === bases[1]

  const style = { width: size, height: size } as const

  if (dead) {
    return (
      <span className={`hero-portrait fallback pos-${hero?.position ?? 'none'}`} style={style} aria-hidden>
        {(hero?.name ?? name).replace(/^각성\s*/, '').slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      className="hero-portrait"
      style={style}
      src={src}
      alt=""
      // loading="lazy"를 쓰면 선택 모달처럼 overflow 안에 든 목록에서 교차 판정이
      // 안 잡혀 그림이 영영 안 뜨는 경우가 있었다. 파일이 평균 17KB로 작고
      // 같은 오리진이라 한 번 받으면 캐시된다 — 그냥 즉시 받는다.
      decoding="async"
      onError={() => setFailed(src)}
    />
  )
}
