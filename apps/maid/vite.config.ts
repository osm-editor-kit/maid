import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { PORTS } from '../../tools/ports.ts'

export default defineConfig({
  // React Compiler through oxc (not Babel): components are memoised at build time
  plugins: [tailwindcss(), react({ compiler: true })],
  server: { port: PORTS.maid, strictPort: true },
  preview: { port: PORTS.maid, strictPort: true },
})
