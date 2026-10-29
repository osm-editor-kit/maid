import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { PORTS } from '../../tools/ports.ts'
import { bootPage } from '../vite-boot.ts'
import { presetsPreload } from '../vite-presets-preload.ts'
import { treeshake } from '../vite-shared.ts'

export default defineConfig({
  // `/` in development; GitHub Pages builds set VITE_BASE=/<repository>/ (.github/workflows/pages.yml)
  base: process.env.VITE_BASE || '/',
  // sprites, label fonts, land.html and frame-sync.js belong to the shell, which every app serves
  publicDir: fileURLToPath(new URL('../../packages/shell/public', import.meta.url)),
  // React Compiler through oxc (not Babel): components are memoised at build time
  plugins: [tailwindcss(), react({ compiler: true }), presetsPreload(), bootPage()],
  // Always 127.0.0.1, never localhost: the OAuth apps on openstreetmap.org and the development server redirect to
  // http://127.0.0.1:5177/land.html, and the login works on that origin only (browser storage is per origin). HMR is
  // pinned to the same host, as in tilda-geo, so the page and its websocket never end up on localhost.
  server: {
    host: '127.0.0.1',
    port: PORTS.maidParking,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: PORTS.maidParking,
      clientPort: PORTS.maidParking,
    },
  },
  build: {
    rolldownOptions: {
      treeshake,
    },
  },
  preview: { host: '127.0.0.1', port: PORTS.maidParking, strictPort: true },
})
