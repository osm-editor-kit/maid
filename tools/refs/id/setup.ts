/**
 * Clone and build iD at the pinned commit into .reference/id (git-ignored).
 *
 *   bun tools/refs/id/setup.ts [--force]
 *
 * Idempotent: skips when .reference/id is at the pinned commit and was built with the
 * same build environment (see BUILD_ENV; recorded in .reference/id/.maid-build.json).
 *
 * Network: GitHub (clone, icons), npm registry (npm ci), jsDelivr (build:data). No OSM
 * infrastructure. The JS bundle is built with iD's own, documented env switches so that
 * every runtime endpoint that would default to OSM infrastructure or a CDN points at
 * localhost instead (core rule 1). No OAuth client id is copied; a dummy is used.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PORTS } from '../../ports'
import pin from './pin.json'

const ROOT = join(import.meta.dir, '../../..')
const DIR = join(ROOT, '.reference/id')
const STAMP = join(DIR, '.maid-build.json')
const SERVE = `http://localhost:${PORTS.id}`
const MOCK = `http://localhost:${PORTS.mockApi}`

/** Read by iD's config/envs.js when the JS bundle is built (esbuild `define`). */
export const BUILD_ENV = {
  // Default connection. The host page switches to the scene given in ?scene= before init.
  ID_API_CONNECTION_URL: `${MOCK}/s/small`,
  ID_API_CONNECTION_API_URL: `${MOCK}/s/small`,
  ID_API_CONNECTION_CLIENT_ID: 'maid-bench-no-auth',
  ID_TAGINFO_API_URL: `${SERVE}/blackhole/taginfo/`,
  ID_NOMINATIM_API_URL: `${SERVE}/blackhole/nominatim/`,
  // Served by tools/refs/id/serve.ts from .reference/id/node_modules
  ID_PRESETS_CDN_URL: `${SERVE}/cdn/id-tagging-schema/`,
  ID_OCI_CDN_URL: `${SERVE}/cdn/osm-community-index/`,
  ID_NSI_CDN_URL: `${SERVE}/cdn/name-suggestion-index/`,
  ID_WMF_SITEMATRIX_CDN_URL: `${SERVE}/blackhole/wmf-sitematrix/`,
  ID_SHOW_DONATION_MESSAGE: 'false',
}

async function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  console.log(`$ ${cmd.join(' ')}`)
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? DIR,
    env: { ...process.env, ...opts.env },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`Command failed with exit code ${code}: ${cmd.join(' ')}`)
}

async function output(cmd: string[], cwd = DIR) {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'ignore' })
  const text = await new Response(proc.stdout).text()
  return (await proc.exited) === 0 ? text.trim() : undefined
}

const force = process.argv.includes('--force')
const wanted = { ...pin, env: BUILD_ENV }

if (!existsSync(join(DIR, '.git'))) {
  await run(['git', 'clone', '--depth', '1', '--branch', pin.tag, pin.repo, DIR], { cwd: ROOT })
}

let head = await output(['git', 'rev-parse', 'HEAD'])
if (head !== pin.commit) {
  // The build rewrites tracked files (dist/, svg/fontawesome), so drop those before moving.
  await run(['git', 'fetch', '--depth', '1', 'origin', `refs/tags/${pin.tag}:refs/tags/${pin.tag}`])
  await run(['git', 'checkout', '--force', pin.commit])
  head = await output(['git', 'rev-parse', 'HEAD'])
}
if (head !== pin.commit) {
  throw new Error(`.reference/id is at ${head}, but pin.json says ${pin.commit} for ${pin.tag}. Fix pin.json or the checkout.`)
}

const stamp = existsSync(STAMP) ? await Bun.file(STAMP).json() : undefined
const built =
  stamp &&
  JSON.stringify(stamp.wanted) === JSON.stringify(wanted) &&
  ['dist/iD.min.js', 'dist/iD.js', 'dist/iD.css', 'dist/img/iD-sprite.svg', 'dist/data/imagery.min.json'].every((f) =>
    existsSync(join(DIR, f)),
  )

if (built && !force) {
  console.log(`iD ${pin.tag} (${pin.commit.slice(0, 9)}) is already built in ${DIR}. Use --force to rebuild.`)
} else {
  await run(['npm', 'ci'])
  // css and data are built exactly as upstream does (data downloads presets from jsDelivr and icons from GitHub).
  await run(['npm', 'run', 'build:css'])
  await run(['npm', 'run', 'build:data'])
  // Only the bundles get our env: dev build (dist/iD.js) and production build (dist/iD.min.js).
  await run(['npm', 'run', 'build:js'], { env: BUILD_ENV })
  // Sprites, mapillary-js, pannellum, and dist:min (the minified bundle, also needs the env).
  await run(['npm', 'run', 'dist'], { env: BUILD_ENV })

  // Guard: the configured endpoints must not be OSM hosts any more.
  for (const file of ['dist/iD.js', 'dist/iD.min.js']) {
    const js = await Bun.file(join(DIR, file)).text()
    for (const needle of ['taginfo.openstreetmap.org', 'nominatim.openstreetmap.org', 'cdn.jsdelivr.net/npm/@openstreetmap']) {
      if (js.includes(needle)) throw new Error(`${file} still contains "${needle}"; the build env was not applied.`)
    }
    if (!js.includes(BUILD_ENV.ID_API_CONNECTION_URL)) throw new Error(`${file} does not contain the mock API url.`)
  }
  await Bun.write(STAMP, JSON.stringify({ wanted, builtAt: new Date().toISOString() }, null, 2))
  console.log(`Built iD ${pin.tag} (${pin.commit.slice(0, 9)}) in ${DIR}`)
}
console.log(`Stamp: ${STAMP}`)
