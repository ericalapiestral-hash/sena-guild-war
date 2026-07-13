import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — GitHub Pages 하위 경로/Vercel 어디에 올려도 동작
export default defineConfig({
  plugins: [react()],
  base: './',
})
