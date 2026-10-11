/**
 * Clone and build Rapid 3 (bhousel/Rapid, NOT facebook/Rapid) at the pinned commit.
 *
 *   bun tools/refs/rapid/setup.ts [--force]
 *
 * Idempotent: does nothing when `.reference/rapid` is already built at the pin.
 * The sibling checkout named in pin.json is only read (used as clone source to save
 * a download); without it we clone from GitHub. Build-time downloads (GitHub, npm) are
 * fine, see AGENTS.md core rule 1. Nothing here talks to OSM infrastructure.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import pin from './pin.json'

const root = resolve(import.meta.dir, '../../..')
const dir = join(root, pin.dir)
const stamp = join(dir, '.maid-built')
const force = process.argv.includes('--force')

async function run(cmd: string[], cwd: string, allowFail = false) {
  console.log(`$ ${cmd.join(' ')}  (in ${cwd})`)
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  const code = await proc.exited
  if (code !== 0 && !allowFail) throw new Error(`${cmd.join(' ')} failed with exit code ${code}`)
  return code
}

async function out(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'ignore' })
  const text = await new Response(proc.stdout).text()
  return (await proc.exited) === 0 ? text.trim() : ''
}

const REQUIRED = ['dist/js/rapid.js', 'dist/js/rapid-worker.js', 'dist/css/rapid.css', 'dist/data', 'dist/img']
const isBuilt = () => REQUIRED.every((p) => existsSync(join(dir, p)))

if (!force && existsSync(stamp) && isBuilt()) {
  const built = (await Bun.file(stamp).text()).trim()
  const head = await out(['git', 'rev-parse', 'HEAD'], dir)
  if (built === pin.commit && head === pin.commit) {
    console.log(`rapid: already built at ${pin.commit} in ${dir}`)
    process.exit(0)
  }
}

if (!existsSync(join(dir, '.git'))) {
  mkdirSync(join(root, '.reference'), { recursive: true })
  console.log(`rapid: cloning from ${pin.repo}`)
  await run(['git', 'clone', '--no-checkout', pin.repo, dir], root)
}

if ((await out(['git', 'cat-file', '-t', pin.commit], dir)) !== 'commit') {
  await run(['git', 'fetch', 'origin', pin.commit], dir)
}
await run(['git', 'checkout', '--force', '--detach', pin.commit], dir)
const head = await out(['git', 'rev-parse', 'HEAD'], dir)
if (head !== pin.commit) throw new Error(`rapid: HEAD is ${head}, expected ${pin.commit}`)

// Rapid imports transitive packages directly (for example `d3-selection` via `d3`), so it
// needs a hoisted node_modules. A global bunfig with `linker = "isolated"` breaks the build,
// hence the explicit flag and the clean-up of a wrongly linked tree.
if (existsSync(join(dir, 'node_modules/.bun'))) rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
const install = ['bun', 'install', '--linker=hoisted']
if ((await run([...install, '--frozen-lockfile'], dir, true)) !== 0) await run(install, dir)
await run(['bun', 'run', 'build'], dir)

if (!isBuilt()) throw new Error(`rapid: build finished but ${REQUIRED.join(', ')} are not all present`)
await Bun.write(stamp, pin.commit + '\n')
console.log(`rapid: built ${pin.commit} in ${join(dir, 'dist')}`)
