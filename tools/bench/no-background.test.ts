import { describe, expect, test } from 'bun:test'
import { noBackground } from './no-background'

describe('noBackground', () => {
  test('adds background=none to the hash', () => {
    expect(noBackground('http://localhost:5173/?scene=small#map=17/52/13')).toBe(
      'http://localhost:5173/?scene=small#map=17/52/13&background=none',
    )
    expect(noBackground('http://localhost:5173/?scene=small')).toBe(
      'http://localhost:5173/?scene=small#background=none',
    )
  })

  test('keeps a background the link names', () => {
    const custom = 'http://localhost:5173/?scene=small#map=17/52/13&background=custom:x'
    expect(noBackground(custom)).toBe(custom)
    expect(noBackground('http://localhost:5173/?bg=Bing')).toBe('http://localhost:5173/?bg=Bing')
  })
})
