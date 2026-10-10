/**
 * Static server for the Rapid benchmark reference.
 *
 *   bun tools/refs/rapid/serve.ts [--port 8082]
 *
 *   /                 our host page (tools/refs/rapid/index.html), `?scene=<name>`
 *   /bench.js         the `window.__bench` adapter
 *   /config.js        ports, scenes and the pinned commit for the adapter (generated)
 *   /js /css /data /img /svg   Rapid's build output from .reference/rapid/dist
 *   /data/modules/*   npm packages Rapid expects there for `assetOrigin = 'local'` (from node_modules)
 *
 * Rapid's own dist/*.html are NOT served: they carry OAuth client ids/secrets and a CSP
 * meta tag that we neither want nor need. No CSP header is sent here.
 * The worker script (js/rapid-worker.min.js) is served next to js/rapid.min.js, which is
 * where WorkerSystem looks for it (it derives the URL from the main script URL).
 */
import { existsSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { SCENES } from '../../fixtures/scenes'
import { PORTS } from '../../ports'
import pin from './pin.json'

const root = resolve(import.meta.dir, '../../..')
const rapidDir = join(root, pin.dir)
const dist = join(rapidDir, 'dist')
const here = import.meta.dir

const OWN: Record<string, string> = {
  '/': join(here, 'index.html'),
  '/index.html': join(here, 'index.html'),
  '/bench.js': join(here, 'bench.js'),
}
/** URL prefix -> directory. Only these parts of the build are reachable. */
const MOUNTS: [string, string][] = [
  // With `assetOrigin = 'local'` Rapid expects these packages under data/modules/, a layout
  // that only the separate rapid-standalone project ships. We map them to node_modules.
  ['/data/modules/id-tagging-schema/', join(rapidDir, 'node_modules/@openstreetmap/id-tagging-schema/dist/')],
  ['/data/modules/name-suggestion-index/dist/', join(rapidDir, 'node_modules/name-suggestion-index/dist/')],
  ['/data/modules/osm-community-index/', join(rapidDir, 'node_modules/osm-community-index/dist/json/')],
  ['/data/modules/wmf-sitematrix/', join(rapidDir, 'node_modules/wmf-sitematrix/data/')],
  ['/data/modules/maplibre-gl/', join(rapidDir, 'node_modules/maplibre-gl/dist/')],
  ['/data/modules/mapillary-js/', join(rapidDir, 'node_modules/mapillary-js/dist/')],
  ['/data/modules/pannellum/', join(rapidDir, 'node_modules/pannellum/build/')],
  ['/js/', join(dist, 'js/')],
  ['/css/', join(dist, 'css/')],
  ['/data/', join(dist, 'data/')],
  ['/img/', join(dist, 'img/')],
  ['/svg/', join(dist, 'svg/')],
]
const TYPES: Record<string, string> = { json5: 'application/json5; charset=utf-8' }

export function createHandler() {
  return (req: Request) => {
    const url = new URL(req.url)
    const pathname = decodeURIComponent(url.pathname)
    const headers = { 'Cache-Control': 'no-store' }
    if (pathname === '/config.js') {
      const config = { mockApi: `http://localhost:${PORTS.mockApi}`, scenes: SCENES, commit: pin.commit }
      return new Response(`window.__benchConfig = ${JSON.stringify(config)}\n`, {
        headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' },
      })
    }
    const own = OWN[pathname]
    if (own) return new Response(Bun.file(own), { headers })
    for (const [prefix, dir] of MOUNTS) {
      if (!pathname.startsWith(prefix)) continue
      const file = normalize(join(dir, pathname.slice(prefix.length)))
      if (!file.startsWith(dir) || !existsSync(file)) break
      const ext = file.split('.').pop() ?? ''
      return new Response(Bun.file(file), { headers: TYPES[ext] ? { ...headers, 'Content-Type': TYPES[ext] } : headers })
    }
    return new Response('Not found', { status: 404 })
  }
}

if (import.meta.main) {
  if (!existsSync(join(dist, 'js/rapid.min.js'))) {
    console.error(`Rapid is not built in ${dist}. Run: bun tools/refs/rapid/setup.ts`)
    process.exit(1)
  }
  const i = process.argv.indexOf('--port')
  const port = i > -1 ? Number(process.argv[i + 1]) : PORTS.rapid
  Bun.serve({ port, hostname: '127.0.0.1', fetch: createHandler() })
  console.log(`rapid reference on http://localhost:${port}/?scene=small (commit ${pin.commit.slice(0, 9)})`)
}
