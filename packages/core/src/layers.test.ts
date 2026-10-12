import { describe, expect, it } from 'bun:test'
import { startSetting, writesStored } from './layers.ts'

describe('startSetting', () => {
  it('takes the strongest layer that has a value', () => {
    expect(startSetting({ fallback: 'a' }).value).toBe('a')
    expect(startSetting({ fallback: 'a', config: 'b' }).value).toBe('b')
    expect(startSetting({ fallback: 'a', config: 'b', stored: 'c' }).value).toBe('c')
    expect(startSetting({ fallback: 'a', config: 'b', stored: 'c', url: 'd' }).value).toBe('d')
  })

  it('keeps the user’s own value next to the one from the URL', () => {
    const start = startSetting({ fallback: 'a', stored: 'c', url: 'd' })
    expect(start).toEqual({ value: 'd', own: 'c', fromUrl: true })
  })

  it('does not count a URL that says what the user has anyway', () => {
    expect(startSetting({ fallback: 'a', stored: 'c', url: 'c' }).fromUrl).toBe(false)
    expect(startSetting({ fallback: '', url: '' }).fromUrl).toBe(false)
  })

  it('compares with the given function', () => {
    const same = (a: string[], b: string[]) => a.join() === b.join()
    expect(startSetting({ fallback: ['x'], url: ['x'] }, same).fromUrl).toBe(false)
  })
})

describe('writesStored', () => {
  it('stores a user action unless the session came from a link', () => {
    expect(writesStored(false)).toBe(true)
    expect(writesStored(true)).toBe(false)
  })
})
