import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { PORTS } from '../../tools/ports.ts'

/**
 * Source patches for MapLibre, applied when Vite loads its files. Each one must match exactly
 * once, so a MapLibre update that changes the code fails the build instead of silently
 * dropping the patch.
 *
 * Not `bun patch`: with Bun's shared package store it would have edited the copy that every
 * project on the machine uses.
 */
const MAPLIBRE_PATCHES = [
  {
    // After the last wheel event MapLibre eases for 200 ms and then keeps the map in its
    // "zooming" state for another fixed 200 ms. Nothing moves in that second part, but the map
    // does not go idle, so the final picture is reported 200 ms late. 40 ms still bridges the
    // gap between two wheel events of one gesture.
    name: 'wheel zoom finish delay',
    find: 'delete this._finishTimeout},200)',
    replace: 'delete this._finishTimeout},40)',
  },
]

function patchMapLibre(): Plugin {
  const applied = new Set<string>()
  return {
    name: 'maid:patch-maplibre',
    enforce: 'pre',
    transform(code, id) {
      if (!/maplibre-gl\/dist\/maplibre-gl(-shared)?\.mjs/.test(id)) return
      let out = code
      for (const patch of MAPLIBRE_PATCHES) {
        const count = out.split(patch.find).length - 1
        if (count === 0) continue
        if (count > 1) throw new Error(`MapLibre patch "${patch.name}" matches ${count} times`)
        out = out.replace(patch.find, patch.replace)
        applied.add(patch.name)
      }
      return out === code ? undefined : { code: out, map: null }
    },
    buildEnd() {
      const missing = MAPLIBRE_PATCHES.filter((p) => !applied.has(p.name)).map((p) => p.name)
      if (missing.length) throw new Error(`MapLibre patches did not apply: ${missing.join(', ')}. Check them against the installed version.`)
    },
  }
}

export default defineConfig({
  plugins: [patchMapLibre(), react()],
  // dev server: do not pre-bundle MapLibre, so the patch above also applies there
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: { port: PORTS.maid, strictPort: true },
  preview: { port: PORTS.maid, strictPort: true },
})
