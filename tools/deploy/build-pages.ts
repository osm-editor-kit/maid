/**
 * Builds the site GitHub Pages serves into `site/` (.github/workflows/pages.yml runs it; it also runs locally).
 *
 *   bun run pages-build
 *
 * The apps and the path come from deploy.env; the environment variables MAID_APP and MAID_BASE win when they are not
 * empty (the workflow passes the repository variables of the same names). MAID_APP is one app folder under apps/, or
 * a comma list of them:
 *
 * - One app is served at the path itself, as a fork that deploys its own editor wants it.
 * - Several apps are each served from a folder of their own (`<path><app>/`), and the path shows a page with a link
 *   to each. They share the land.html at the path (VITE_LOGIN_BASE, read by the shell's auth), so the OAuth apps need
 *   one redirect URI for all of them: `<origin><path>land.html`.
 *
 * Nothing here contacts OSM. The client ids come from the environment (VITE_OSM_CLIENT_ID, VITE_OSM_DEV_CLIENT_ID).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { factoriesOf, indexPage } from './showcase/page.ts'
import type { ListedApp, Overview } from './showcase/types.ts'

export { indexPage }

const ROOT = join(import.meta.dir, '../..')
const SITE = join(ROOT, 'site')
/** The screenshots of the apps on the overview page: made by hand from the fixtures (see showcase/shots/README.md) */
const SHOTS = join(import.meta.dir, 'showcase', 'shots')

/** `KEY=value` lines of deploy.env; comments and blank lines are skipped */
export function readDeployEnv(text: string) {
  const values: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match) values[match[1]!] = match[2]!.trim()
  }
  return values
}

/** The path as a directory: empty is `/<repository>/`; `/` stays `/`; `maid` and `/maid/` become `/maid/` */
export function basePathOf(base: string, repository: string) {
  const chosen = base === '' ? `/${repository.split('/')[1] ?? ''}/` : base
  const inner = chosen.replace(/^\/+|\/+$/g, '')
  return inner === '' ? '/' : `/${inner}/`
}

/** The app folders of a list (commas or spaces), each once, in the order given */
export function appsOf(list: string) {
  return [
    ...new Set(
      list
        .split(/[\s,]+/)
        .map((app) => app.trim())
        .filter((app) => app !== ''),
    ),
  ]
}

/** `apps/<app>/overview.json`: the app's tile on the overview page */
export function readOverview(text: string): Overview {
  const value = JSON.parse(text) as Partial<Overview>
  const texts = (list: unknown) =>
    Array.isArray(list) && list.every((item) => typeof item === 'string')
  if (
    typeof value.tagline !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.open !== 'string' ||
    !texts(value.highlights)
  ) {
    throw new Error(
      'overview.json needs "tagline", "description", "open" (texts) and "highlights" (a list of texts)',
    )
  }
  return {
    tagline: value.tagline,
    description: value.description,
    highlights: value.highlights!,
    open: value.open,
  }
}

/** The app as the overview page lists it: name and detail from its config, logo, tile text and module factories */
export function listedApp(app: string): ListedApp {
  const dir = join(ROOT, 'apps', app)
  const config = readFileSync(join(dir, 'src', 'maid.config.ts'), 'utf8')
  const brand = /brand:\s*\{\s*name:\s*'([^']+)',\s*detail:\s*'([^']+)'/.exec(config)
  return {
    folder: app,
    name: brand?.[1] ?? app,
    detail: brand?.[2] ?? '',
    logo: readFileSync(join(dir, 'src', 'brand', 'logo.svg'), 'utf8')
      .replace(/<\?xml[^>]*>\s*/, '')
      .trim(),
    overview: readOverview(readFileSync(join(dir, 'overview.json'), 'utf8')),
    factories: factoriesOf(config),
    shot: existsSync(join(SHOTS, `${app}.webp`)) ? `shots/${app}.webp` : undefined,
  }
}

async function build(app: string, env: Record<string, string>) {
  const proc = Bun.spawn([process.execPath, 'run', 'build'], {
    cwd: join(ROOT, 'apps', app),
    env: { ...process.env, ...env },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if ((await proc.exited) !== 0) throw new Error(`The build of apps/${app} failed`)
}

if (import.meta.main) {
  const file = readDeployEnv(readFileSync(join(ROOT, 'deploy.env'), 'utf8'))
  const repository = process.env.GITHUB_REPOSITORY ?? 'osm-editor-kit/maid'
  const apps = appsOf(process.env.MAID_APP || file.MAID_APP || 'maid')
  const base = basePathOf(process.env.MAID_BASE || file.MAID_BASE || '', repository)
  for (const app of apps) {
    if (!/^[\w-]+$/.test(app) || !existsSync(join(ROOT, 'apps', app, 'src', 'maid.config.ts'))) {
      throw new Error(`MAID_APP names "${app}", which is not an app folder under apps/`)
    }
  }
  if (apps.length === 0) throw new Error('MAID_APP names no app')

  rmSync(SITE, { recursive: true, force: true })
  const [only] = apps
  if (apps.length === 1 && only !== undefined) {
    await build(only, { VITE_BASE: base })
    cpSync(join(ROOT, 'apps', only, 'dist'), SITE, { recursive: true })
  } else {
    mkdirSync(SITE)
    for (const app of apps) {
      await build(app, { VITE_BASE: `${base}${app}/`, VITE_LOGIN_BASE: base })
      cpSync(join(ROOT, 'apps', app, 'dist'), join(SITE, app), { recursive: true })
    }
    cpSync(join(ROOT, 'packages/shell/public/land.html'), join(SITE, 'land.html'))
    cpSync(SHOTS, join(SITE, 'shots'), { recursive: true, filter: (path) => !path.endsWith('.md') })
    writeFileSync(join(SITE, 'index.html'), indexPage(apps.map(listedApp), repository))
  }

  const lines = [`Deployed with the path ${base}:`]
  if (apps.length === 1) lines.push(`- ${only}: ${base}`)
  else for (const app of apps) lines.push(`- ${app}: ${base}${app}/`)
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' })
  console.log(`Wrote ${SITE}`)
}
