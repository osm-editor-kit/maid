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

const ROOT = join(import.meta.dir, '../..')
const SITE = join(ROOT, 'site')

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

/**
 * What sets one app apart, from `apps/<app>/overview.json`: `compared` says against what (iD for the standard editor,
 * the standard editor for the others), `features` lists the differences. The page shows them in a row that opens under
 * the app's link. An app without the file gets no such row.
 */
export type Overview = { compared: string; features: string[] }

/** The page's listed app: its folder, its title and what sets it apart */
export type ListedApp = { folder: string; title: string; overview?: Overview }

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function itemOf(app: ListedApp) {
  const link = `<a href="${app.folder}/">${escapeHtml(app.title)}</a> <code>${app.folder}</code>`
  if (!app.overview || app.overview.features.length === 0) return `      <li>${link}</li>`
  const features = app.overview.features
    .map((feature) => `            <li>${escapeHtml(feature)}</li>`)
    .join('\n')
  return `      <li>
        ${link}
        <details>
          <summary>${escapeHtml(app.overview.compared)}</summary>
          <ul>
${features}
          </ul>
        </details>
      </li>`
}

/** The page at the path when several apps are deployed: one link per app, with its title and what sets it apart */
export function indexPage(apps: ListedApp[], repository: string) {
  const items = apps.map(itemOf).join('\n')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Maid apps</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #18181b; background: #fff; }
      a { color: #2563eb; }
      code { color: #71717a; font-size: 0.875em; }
      body > ul > li { margin-bottom: 0.75rem; }
      details { color: #52525b; font-size: 0.9375em; }
      summary { cursor: pointer; }
      details ul { margin: 0.25rem 0 0; padding-left: 1.25rem; }
      @media (prefers-color-scheme: dark) {
        body { color: #f4f4f5; background: #18181b; }
        a { color: #60a5fa; }
        code { color: #a1a1aa; }
        details { color: #d4d4d8; }
      }
    </style>
  </head>
  <body>
    <h1>Maid apps</h1>
    <p>The editors built from <a href="https://github.com/${repository}">${repository}</a>, each on its own.</p>
    <ul>
${items}
    </ul>
  </body>
</html>
`
}

/** `apps/<app>/overview.json`, or undefined when the app has none */
export function readOverview(text: string | undefined): Overview | undefined {
  if (text === undefined) return undefined
  const value = JSON.parse(text) as Partial<Overview>
  if (typeof value.compared !== 'string' || !Array.isArray(value.features)) {
    throw new Error('overview.json needs "compared" (a text) and "features" (a list of texts)')
  }
  return { compared: value.compared, features: value.features.map(String) }
}

function overviewOf(app: string) {
  const file = join(ROOT, 'apps', app, 'overview.json')
  return readOverview(existsSync(file) ? readFileSync(file, 'utf8') : undefined)
}

function titleOf(app: string) {
  const html = readFileSync(join(ROOT, 'apps', app, 'index.html'), 'utf8')
  return /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() || app
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
    const listed = apps.map((app) => ({
      folder: app,
      title: titleOf(app),
      overview: overviewOf(app),
    }))
    writeFileSync(join(SITE, 'index.html'), indexPage(listed, repository))
  }

  const lines = [`Deployed with the path ${base}:`]
  if (apps.length === 1) lines.push(`- ${only}: ${base}`)
  else for (const app of apps) lines.push(`- ${app}: ${base}${app}/`)
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' })
  console.log(`Wrote ${SITE}`)
}
