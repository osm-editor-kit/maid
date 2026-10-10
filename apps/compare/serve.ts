/** Serves the side-by-side page. Needs the three editors and the mock API running (bun run compare). */
import { join } from 'node:path'
import { SCENES } from '../../tools/fixtures/scenes'
import { PORTS } from '../../tools/ports'

Bun.serve({
  port: PORTS.compare,
  hostname: '127.0.0.1',
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname === '/config.json') {
      return Response.json({ scenes: SCENES, ports: { maid: PORTS.maidBuild, id: PORTS.id, rapid: PORTS.rapid } })
    }
    return new Response(Bun.file(join(import.meta.dir, 'index.html')))
  },
})
console.log(`compare page on http://localhost:${PORTS.compare}`)
