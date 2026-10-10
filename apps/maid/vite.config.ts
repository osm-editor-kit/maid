import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { PORTS } from '../../tools/ports.ts'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: PORTS.maid, strictPort: true },
  preview: { port: PORTS.maid, strictPort: true },
})
