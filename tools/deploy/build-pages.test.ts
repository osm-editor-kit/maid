import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appsOf, basePathOf, indexPage, readDeployEnv, readOverview } from './build-pages.ts'

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

  it('links each app by its folder, with its title', () => {
    const page = indexPage(
      [{ folder: 'maid-bicycle', title: 'Maid Bicycle' }],
      'osm-editor-kit/maid',
    )
    expect(page).toContain('<a href="maid-bicycle/">Maid Bicycle</a>')
  })

  it('opens a row under an app with what sets it apart', () => {
    const page = indexPage(
      [
        {
          folder: 'maid',
          title: 'Maid',
          overview: { compared: 'Compared with iD', features: ['Indoor & levels'] },
        },
        { folder: 'other', title: 'Other' },
      ],
      'osm-editor-kit/maid',
    )
    expect(page).toContain('<summary>Compared with iD</summary>')
    expect(page).toContain('<li>Indoor &amp; levels</li>')
    expect(page).toContain('<li><a href="other/">Other</a> <code>other</code></li>')
  })

  it('has an overview for every deployed app, and the indoor editor names indoor', () => {
    const root = join(import.meta.dir, '../..')
    const env = readDeployEnv(readFileSync(join(root, 'deploy.env'), 'utf8'))
    for (const app of appsOf(env.MAID_APP ?? '')) {
      const overview = readOverview(readFileSync(join(root, 'apps', app, 'overview.json'), 'utf8'))
      expect(overview?.features.length).toBeGreaterThan(0)
    }
    const indoor = readOverview(readFileSync(join(root, 'apps/maid-indoor/overview.json'), 'utf8'))
    expect(indoor?.features.some((feature) => feature.startsWith('Indoor'))).toBe(true)
  })
})
