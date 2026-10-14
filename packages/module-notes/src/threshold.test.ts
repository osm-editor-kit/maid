import { describe, expect, test } from 'bun:test'
import { toOsmZoom } from '@osm-editor-kit/maid-core'
import {
  loadsAt,
  NOTES_LIMIT,
  NOTES_MIN_ZOOM,
  TRUNCATED_NOTICE_TEXT,
  truncationNotice,
} from './model.ts'

describe('the zoom gate of the notes, in OSM zoom (iD: minZoom 12)', () => {
  test('the gate is OSM zoom 12, as iD has it', () => {
    expect(NOTES_MIN_ZOOM).toBe(12)
    expect(loadsAt(12)).toBe(true)
    expect(loadsAt(11.99)).toBe(false)
  })

  test('the map zoom is converted first: MapLibre 11 is OSM 12, so the notes load there', () => {
    expect(loadsAt(toOsmZoom(11))).toBe(true)
    // MapLibre 10.99 is OSM 11.99: below the gate. Read without the conversion it would pass as 10.99
    expect(loadsAt(toOsmZoom(10.99))).toBe(false)
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
