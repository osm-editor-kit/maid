/**
 * Static server for the iD reference: our host page plus the built iD assets.
 *
 *   bun tools/refs/id/serve.ts [--port 8081]
 *
 *   /                      tools/refs/id/index.html   (?scene=small|medium|dense, ?build=min|dev)
 *   /adapter.js            tools/refs/id/adapter.js   (window.__bench)
 *   /frame-sync.js         tools/refs/frame-sync.js   (shared camera sync for the compare page)
 *   /bench-config.js       generated from tools/ports.ts and tools/fixtures/scenes.ts
 *   /dist/**               .reference/id/dist
 *   /cdn/<package>/**      .reference/id/node_modules/<package> (what iD would fetch from jsDelivr)
 *   /blackhole/**          404, logged. Target for endpoints we neutralised at build time (taginfo, nominatim).
 *   /requests              log of /blackhole and 404 hits, /requests/reset clears it
 */
import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { PORTS } from '../../ports'
import { SCENES } from '../../fixtures/scenes'
import pin from './pin.json'

const ROOT = join(import.meta.dir, '../../..')
const ID_DIR = join(ROOT, '.reference/id')

const MOUNTS: [prefix: string, dir: string][] = [
  ['/dist/', join(ID_DIR, 'dist')],
  ['/cdn/id-tagging-schema/', join(ID_DIR, 'node_modules/@openstreetmap/id-tagging-schema')],
  ['/cdn/osm-community-index/', join(ID_DIR, 'node_modules/osm-community-index')],
  ['/cdn/name-suggestion-index/', join(ID_DIR, 'node_modules/name-suggestion-index')],
]

const NO_CACHE = { 'Cache-Control': 'no-store' }

export function createHandler() {
  const log: { t: number; path: string; status: number }[] = []
  const note = (path: string, status: number) => log.push({ t: Date.now(), path, status })
  const config = `window.__BENCH_CONFIG = ${JSON.stringify({
    mockApi: `http://localhost:${PORTS.mockApi}`,
    scenes: SCENES,
    pin,
  })};\n`

  return async (req: Request) => {
    const url = new URL(req.url)
    const path = decodeURIComponent(url.pathname)
    if (path === '/requests') return Response.json(log)
    if (path === '/requests/reset') {
      log.length = 0
      return Response.json({ ok: true })
    }
    if (path === '/' || path === '/index.html') {
      return new Response(Bun.file(join(import.meta.dir, 'index.html')), { headers: NO_CACHE })
    }
    if (path === '/adapter.js') {
      return new Response(Bun.file(join(import.meta.dir, 'adapter.js')), { headers: NO_CACHE })
    }
    if (path === '/frame-sync.js') {
      return new Response(Bun.file(join(import.meta.dir, '../frame-sync.js')), { headers: NO_CACHE })
    }
    if (path === '/bench-config.js') {
      return new Response(config, { headers: { ...NO_CACHE, 'Content-Type': 'text/javascript; charset=utf-8' } })
    }
    for (const [prefix, dir] of MOUNTS) {
      if (!path.startsWith(prefix)) continue
      const file = normalize(join(dir, path.slice(prefix.length)))
      if (!file.startsWith(dir + '/')) break // no path traversal
      const f = Bun.file(file)
      if (await f.exists()) return new Response(f, { headers: NO_CACHE })
      break
    }
    note(path + url.search, 404)
    return new Response('Not found', { status: 404 })
  }
}

if (import.meta.main) {
  const i = process.argv.indexOf('--port')
  const port = Number(i > -1 ? process.argv[i + 1] : PORTS.id)
  if (!existsSync(join(ID_DIR, 'dist/iD.min.js'))) {
    console.error(`iD is not built in ${ID_DIR}. Run: bun tools/refs/id/setup.ts`)
    process.exit(1)
  }
  Bun.serve({ port, hostname: '127.0.0.1', fetch: createHandler() })
  console.log(`iD ${pin.tag} reference on http://localhost:${port}/?scene=small (assets from ${ID_DIR})`)
}
