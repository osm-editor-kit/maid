import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { PORTS } from '../../tools/ports.ts'
import { presetsPreload } from '../vite-presets-preload.ts'
import { treeshake } from '../vite-shared.ts'

export default defineConfig({
  // `/` in development; GitHub Pages builds set VITE_BASE=/<repository>/ (.github/workflows/pages.yml)
  base: process.env.VITE_BASE || '/',
  // sprites, label fonts, land.html and frame-sync.js belong to the shell, which every app serves
  publicDir: fileURLToPath(new URL('../../packages/shell/public', import.meta.url)),
  // React Compiler through oxc (not Babel): components are memoised at build time
  plugins: [tailwindcss(), react({ compiler: true }), presetsPreload()],
  // 127.0.0.1, not Vite's default (which is IPv6-only here): the OAuth app on the OSM development
  // server redirects to http://127.0.0.1:5177/land.html. `localhost` still reaches it.
  server: { host: '127.0.0.1', port: PORTS.maidParking, strictPort: true },
  build: {
    rolldownOptions: {
      treeshake,
    },
  },
  preview: { port: PORTS.maidParking, strictPort: true },
})
