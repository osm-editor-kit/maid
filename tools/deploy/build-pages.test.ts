import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appsOf, basePathOf, indexPage, listedApp, readDeployEnv } from './build-pages.ts'
import { deployedApps, FEATURES_DOC, featuresDoc } from './features-doc.ts'
import { GROUPS } from './showcase/features.ts'
import { factoriesOf, supportOf } from './showcase/page.ts'

describe('pages build', () => {
  it('reads deploy.env lines and skips comments', () => {
    expect(readDeployEnv('# comment\nMAID_APP=maid,maid-bicycle\r\nMAID_BASE=\n')).toEqual({
      MAID_APP: 'maid,maid-bicycle',
      MAID_BASE: '',
    })
  })

  it('lists the apps once, separated by commas or spaces', () => {
    expect(appsOf('maid, maid-bicycle maid')).toEqual(['maid', 'maid-bicycle'])
    expect(appsOf('')).toEqual([])
  })

  it('makes the path a directory, and an empty path the repository name', () => {
    expect(basePathOf('', 'osm-editor-kit/maid')).toBe('/maid/')
    expect(basePathOf('/', 'a/b')).toBe('/')
    expect(basePathOf('editor', 'a/b')).toBe('/editor/')
  })

  it('reads the module factories of an app config', () => {
    const config = `const background = imagery()\nconst modules: MaidModule[] = [\n    tasks(),\n    lenses({ lenses: [x] }),\n    background,\n    angleSnap({ lengths: true }),\n  ]\n  if (bbox) modules.push(sceneBounds({ bbox }))`
    expect([...factoriesOf(config)].sort()).toEqual(['angleSnap', 'imagery', 'lenses', 'tasks'])
  })

  it('lists every deployed app with a tile, and the comparison follows its config', () => {
    const root = join(import.meta.dir, '../..')
    const env = readDeployEnv(readFileSync(join(root, 'deploy.env'), 'utf8'))
    const apps = appsOf(env.MAID_APP ?? '').map(listedApp)
    for (const app of apps) {
      expect(app.overview.highlights.length).toBeGreaterThan(2)
      expect(app.overview.open).toMatch(/^map=[\d.]+\/-?[\d.]+\/-?[\d.]+/)
      expect(app.logo.startsWith('<svg')).toBe(true)
    }
    const indoor = apps.find((app) => app.folder === 'maid-indoor')!
    const levels = GROUPS.flatMap((group) => group.rows).find((row) =>
      row.title.startsWith('Indoor'),
    )!
    expect(supportOf(levels, indoor)).toBe('yes')
    expect(
      supportOf(
        levels,
        apps.find((app) => app.folder === 'maid')!,
      ),
    ).toBe('no')
    const page = indexPage(apps, 'osm-editor-kit/maid')
    expect(page).toContain('<a class="button primary" href="maid-indoor/?map=')
    expect(page).toContain('https://github.com/bhousel/Rapid')
  })

  it('names in the comparison every module an app switches on', () => {
    const root = join(import.meta.dir, '../..')
    const named = new Set(
      GROUPS.flatMap((group) => group.rows).flatMap((row) =>
        row.maid === 'core' ? [] : 'factory' in row.maid ? [row.maid.factory] : row.maid.factories,
      ),
    )
    // built into the shell or plumbing, covered by the core rows
    const plumbing = new Set([
      'elementInfo',
      'operations',
      'relations',
      'validation',
      'sceneBounds',
    ])
    for (const app of appsOf(
      readDeployEnv(readFileSync(join(root, 'deploy.env'), 'utf8')).MAID_APP ?? '',
    )) {
      for (const factory of listedApp(app).factories) {
        if (!plumbing.has(factory))
          expect(`${app}: ${factory} ${named.has(factory) ? 'named' : 'missing'}`).toBe(
            `${app}: ${factory} named`,
          )
      }
    }
  })

  it('links the docs of a row only to a package that has a README', () => {
    const root = join(import.meta.dir, '../..')
    for (const row of GROUPS.flatMap((group) => group.rows)) {
      if (row.pkg)
        expect(`${row.pkg}: ${existsSync(join(root, 'packages', row.pkg, 'README.md'))}`).toBe(
          `${row.pkg}: true`,
        )
    }
  })

  it('has docs/features.md up to date (bun run features-doc)', () => {
    expect(readFileSync(FEATURES_DOC, 'utf8')).toBe(featuresDoc(deployedApps()))
  })
})
