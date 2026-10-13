import { describe, expect, test } from 'bun:test'
import { appUrl, basePath, baseUrl, publicUrl } from './public-url'

describe('basePath', () => {
  test('a root base stays the root, and a sub-path becomes a directory with both slashes', () => {
    expect(basePath('/')).toBe('/')
    expect(basePath('')).toBe('/')
    expect(basePath('/maid')).toBe('/maid/')
    expect(basePath('maid/')).toBe('/maid/')
    expect(basePath('/maid/')).toBe('/maid/')
  })
})

describe('publicUrl', () => {
  test('a root build keeps the same origin-relative addresses as before', () => {
    expect(publicUrl('land.html', '/', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/land.html',
    )
    expect(publicUrl('/sprites/maki-sprite.svg', '/', 'http://localhost:5173')).toBe(
      'http://localhost:5173/sprites/maki-sprite.svg',
    )
  })

  test('a GitHub Pages build puts every file under the repository path', () => {
    const origin = 'https://osm-editor-kit.github.io'
    expect(publicUrl('land.html', '/maid/', origin)).toBe(
      'https://osm-editor-kit.github.io/maid/land.html',
    )
    expect(publicUrl('sprites/fa-sprite.svg', '/maid/', origin)).toBe(
      'https://osm-editor-kit.github.io/maid/sprites/fa-sprite.svg',
    )
  })

  test('a glyph template keeps its braces, which a URL parser would escape', () => {
    expect(publicUrl('fonts/{fontstack}/{range}.pbf', '/maid/', 'https://h.example')).toBe(
      'https://h.example/maid/fonts/{fontstack}/{range}.pbf',
    )
    expect(baseUrl('/maid/', 'https://h.example')).toBe('https://h.example/maid/')
  })

  test('appUrl works without a browser: the base is then the root, the origin localhost', () => {
    expect(appUrl('sprites/iD-sprite.svg')).toBe('http://localhost/sprites/iD-sprite.svg')
  })
})
