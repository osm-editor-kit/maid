import { join } from 'node:path'
/**
 * Starts everything the side-by-side page needs and skips what is already running:
 * mock OSM API, iD, Rapid, a production build of Maid, and the page itself.
 */
import { spawn } from 'bun'
import { PORTS } from '../../tools/ports'

const ROOT = join(import.meta.dir, '../..')

async function listening(port: number) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

async function ensure(name: string, port: number, cmd: string[]) {
  if (await listening(port)) return console.log(`${name}: already running on :${port}`)
  spawn(cmd, { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' })
  for (let i = 0; i < 150; i++) {
    if (await listening(port)) return console.log(`${name}: started on :${port}`)
    await Bun.sleep(200)
  }
  throw new Error(`${name} did not come up on port ${port}`)
}

await ensure('mock OSM API', PORTS.mockApi, ['bun', 'tools/mock-osm-api/server.ts'])
await ensure('iD', PORTS.id, ['bun', 'tools/refs/id/serve.ts'])
await ensure('Rapid', PORTS.rapid, ['bun', 'tools/refs/rapid/serve.ts'])
if (!(await listening(PORTS.maidBuild))) {
  // VITE_BENCH=1: the side-by-side page syncs the editors through window.__bench (public/frame-sync.js)
  const build = spawn(['bun', 'run', '--cwd', 'apps/maid', 'build'], {
    cwd: ROOT,
    env: { ...process.env, VITE_BENCH: '1' },
    stdout: 'ignore',
    stderr: 'inherit',
  })
  if ((await build.exited) !== 0) throw new Error('Maid build failed')
}
await ensure('Maid', PORTS.maidBuild, [
  'bun',
  'run',
  '--cwd',
  'apps/maid',
  'preview',
  '--port',
  String(PORTS.maidBuild),
])
await ensure('compare page', PORTS.compare, ['bun', 'apps/compare/serve.ts'])
console.log(`\nOpen http://localhost:${PORTS.compare}  (Ctrl+C stops the servers started here)`)
await new Promise(() => {})
