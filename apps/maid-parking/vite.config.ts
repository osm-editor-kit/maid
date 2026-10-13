import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { PORTS } from '../../tools/ports.ts'
import { presetsPreload } from '../vite-presets-preload.ts'

export default defineConfig({
  // sprites, label fonts, land.html and frame-sync.js belong to the shell, which every app serves
  publicDir: fileURLToPath(new URL('../../packages/shell/public', import.meta.url)),
  // React Compiler through oxc (not Babel): components are memoised at build time
  plugins: [tailwindcss(), react({ compiler: true }), presetsPreload()],
  // 127.0.0.1, not Vite's default (which is IPv6-only here): the OAuth app on the OSM development
  // server redirects to http://127.0.0.1:5177/land.html. `localhost` still reaches it.
  server: { host: '127.0.0.1', port: PORTS.maidParking, strictPort: true },
  build: {
    rolldownOptions: {
      // packages/ui is a barrel of many modules (inspector fields, tags sheet, ...). Without this, the bundler keeps
      // every module of it in the entry chunk, also those only the lazy inspector uses. None of them does work at
      // import time (`extension-points.ts` only declares types), so a module nobody imports can go.
      treeshake: {
        moduleSideEffects: [
          { test: /[\\/]packages[\\/]ui[\\/]src[\\/]/, sideEffects: false },
          // the same for the presets package: the shell imports `discardedTags` from its index, which must not keep
          // the matching code and the country data in the entry
          { test: /[\\/]packages[\\/]presets[\\/]src[\\/]/, sideEffects: false },
        ],
      },
    },
  },
  preview: { port: PORTS.maidParking, strictPort: true },
})
