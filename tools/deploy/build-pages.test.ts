import { describe, expect, it } from 'bun:test'
import { appsOf, basePathOf, indexPage, readDeployEnv } from './build-pages.ts'

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
})
