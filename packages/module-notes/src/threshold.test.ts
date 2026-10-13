import { describe, expect, test } from 'bun:test'
import {
  loadsAt,
  NOTES_LIMIT,
  osmZoomOf,
  TRUNCATED_NOTICE_TEXT,
  truncationNotice,
} from './model.ts'

describe('the zoom threshold, in both conventions', () => {
  test('OSM zoom is MapLibre zoom plus one (512 px against 256 px tiles)', () => {
    expect(osmZoomOf(13)).toBe(14)
    expect(osmZoomOf(15)).toBe(16)
  })

  test('the notes load at OSM 14, which is MapLibre 13', () => {
    expect(loadsAt(13, 14)).toBe(true)
    // MapLibre 13 read as an OSM zoom would be 13: below 14, so a bug of that kind fails here
    expect(loadsAt(12.99, 14)).toBe(false)
  })

  test('the old threshold of 16 (the data zoom) is now MapLibre 15', () => {
    expect(loadsAt(14.99, 16)).toBe(false)
    expect(loadsAt(15, 16)).toBe(true)
  })

  test('a fractional zoom counts from its whole level on the OSM side', () => {
    expect(loadsAt(13.4, 14)).toBe(true)
  })
})

describe('the notice of a list cut at the limit', () => {
  test('it fires once, when a view starts to have a cut list', () => {
    const first = truncationNotice(false, true)
    expect(first).toEqual({ shown: true, notify: true })
  })

  test('the same view, moved on while it still has a cut list, does not fire again', () => {
    const next = truncationNotice(true, true)
    expect(next).toEqual({ shown: true, notify: false })
  })

  test('a view without a cut list makes it ready again', () => {
    expect(truncationNotice(true, false)).toEqual({ shown: false, notify: false })
    expect(truncationNotice(false, true)).toEqual({ shown: true, notify: true })
  })

  test('the text names the limit the request uses', () => {
    expect(TRUNCATED_NOTICE_TEXT).toContain(`first ${NOTES_LIMIT} notes`)
  })
})
