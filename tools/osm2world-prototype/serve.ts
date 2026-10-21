/**
 * The OSM2World prototype on http://localhost:5190: the indoor fixture (Berlin Hauptbahnhof) converted to 3D in the
 * browser with OSM2World's web build, shown with Babylon.js. Everything is served from here; nothing is fetched from
 * outside. Needs `bun run osm2world-fetch` once.
 *
 *   bun run osm2world-prototype
 */
import { join } from 'node:path'

const here = import.meta.dir
const fixture = join(here, '../../fixtures/indoor.json.gz')
const PORT = 5190

/** The fixture as OSM JSON, read once */
const osmJson = Bun.gunzipSync(new Uint8Array(await Bun.file(fixture).arrayBuffer()))

const routes: Record<string, () => Response> = {
  '/': () => new Response(Bun.file(join(here, 'index.html'))),
  '/babylon.js': () => new Response(Bun.file(join(here, 'node_modules/babylonjs/babylon.js'))),
  '/data.json': () => new Response(osmJson, { headers: { 'content-type': 'application/json' } }),
  '/vendor/osm2world-core-web.mjs': () =>
    new Response(Bun.file(join(here, 'vendor/osm2world-core-web.mjs')), {
      headers: { 'content-type': 'text/javascript' },
    }),
}

Bun.serve({
  port: PORT,
  fetch(request) {
    const path = new URL(request.url).pathname
    const route = routes[path]
    if (route) return route()
    // the style and the files it includes (vendor/*.properties)
    if (/^\/vendor\/[\w/-]+\.properties$/.test(path))
      return new Response(Bun.file(join(here, path)))
    return new Response('not here', { status: 404 })
  },
})
console.log(`OSM2World prototype on http://localhost:${PORT}`)
