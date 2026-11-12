import { describe, expect, test } from 'bun:test'
import { shouldUnscroll, type PageView } from './page-pin'

const iPad: PageView = {
  scrollX: 0,
  scrollY: 0,
  innerHeight: 1000,
  viewportHeight: 1000,
  scale: 1,
  typing: false,
}

describe('shouldUnscroll', () => {
  test('a page at 0 stays', () => {
    expect(shouldUnscroll(iPad)).toBe(false)
  })

  test('a page left scrolled after the keyboard closed goes back (the iPad report)', () => {
    expect(shouldUnscroll({ ...iPad, scrollY: 230 })).toBe(true)
  })

  test('while the keyboard is open for a field, iOS may scroll the page', () => {
    expect(shouldUnscroll({ ...iPad, scrollY: 230, viewportHeight: 600, typing: true })).toBe(false)
  })

  test('the keyboard hidden by its own key with the focus kept: back to 0', () => {
    expect(shouldUnscroll({ ...iPad, scrollY: 230, typing: true })).toBe(true)
  })

  test('a hardware keyboard shortcut row is not a keyboard', () => {
    expect(shouldUnscroll({ ...iPad, scrollY: 230, viewportHeight: 945, typing: true })).toBe(true)
  })

  test('a pinch zoom is left alone', () => {
    expect(shouldUnscroll({ ...iPad, scrollY: 230, viewportHeight: 500, scale: 2 })).toBe(false)
  })

  test('a sideways scroll goes back too', () => {
    expect(shouldUnscroll({ ...iPad, scrollX: 40 })).toBe(true)
  })

  test('without visualViewport a scrolled page goes back once no field has the focus', () => {
    const old = { ...iPad, scrollY: 100, viewportHeight: undefined, scale: undefined }
    expect(shouldUnscroll(old)).toBe(true)
    expect(shouldUnscroll({ ...old, typing: true })).toBe(true)
  })
})
