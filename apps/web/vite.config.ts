import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true listens on every interface so the app is reachable by LAN IP, not only localhost.
  server: { host: true, proxy: { '/api': 'http://localhost:8787' } },
  preview: { host: true, proxy: { '/api': 'http://localhost:8787' } },
})
