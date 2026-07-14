// 미니멀 라인 아이콘 (currentColor 사용)
const PATHS: Record<string, string> = {
  home: 'M4 11 12 4l8 7M6 9.5V20h12V9.5',
  target:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z',
  shield: 'M12 3.5 5.5 6v5.2c0 4.3 2.8 7 6.5 8.3 3.7-1.3 6.5-4 6.5-8.3V6L12 3.5Z',
  book: 'M12 6C10.5 5 8 4.5 5 4.5V18c3 0 5.5.5 7 1.5 1.5-1 4-1.5 7-1.5V4.5c-3 0-5.5.5-7 1.5ZM12 6v13.5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2',
  users:
    'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19.5c0-2.9 2.5-4.5 5.5-4.5s5.5 1.6 5.5 4.5M16 11.2a2.6 2.6 0 1 0-1-5M18.2 15c2.1.3 3.3 1.9 3.3 4.5',
  data: 'M12 3.2c3.9 0 7 1.2 7 2.8s-3.1 2.8-7 2.8-7-1.2-7-2.8 3.1-2.8 7-2.8ZM5 6v12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V6M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  flag: 'M6 21V4.5M6 5h11l-1.8 3L17 11H6',
  live: 'M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1ZM8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M6 6a8 8 0 0 0 0 12M18 6a8 8 0 0 1 0 12',
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
