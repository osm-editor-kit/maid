import { describe, expect, test } from 'bun:test'
import {
  boxOf,
  cellBox,
  cellKey,
  cellsOf,
  formatDate,
  markersOf,
  noteWebUrl,
  notesIn,
  notesUrl,
  parseNotes,
  sortNotes,
  summaryLine,
  type Note,
} from './model.ts'

const feature = (id: number, overrides: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [13.4, 52.389] },
  properties: {
    id,
    status: 'open',
    date_created: '2026-09-28T07:14:03Z',
    comments: [{ date: '2026-09-28T07:14:03Z', action: 'opened', text: 'Kaputter Poller' }],
    ...overrides,
  },
})

const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features })

describe('grid cells', () => {
  test('a box inside one cell is that one cell', () => {
    expect(cellsOf([13.401, 52.3901, 13.4049, 52.3949])).toEqual([{ i: 268, j: 1047 }])
  })

  test('a box on the grid lines does not take the cell beyond its east and north edge', () => {
    // 13.40 and 52.40 are grid lines: the box ends where the cell 13.40-13.45 begins
    const cells = cellsOf([13.4, 52.4, 13.45, 52.45])
    expect(cells).toEqual([{ i: 268, j: 1048 }])
  })

  test('the cells of a box are all of its cells, and their box rounds outward', () => {
    const bbox = [13.39, 52.38, 13.42, 52.41] as const
    const cells = cellsOf([...bbox])
    expect(cells.length).toBe(4) // 2 columns (13.35-13.40, 13.40-13.45) x 2 rows
    expect(boxOf(cells)).toEqual([13.35, 52.35, 13.45, 52.45])
    expect(cellBox({ i: 268, j: 1048 })).toEqual([13.4, 52.4, 13.45, 52.45])
  })

  test('cell keys tell the open and the all mode apart', () => {
    expect(cellKey('open', { i: 1, j: 2 })).not.toBe(cellKey('all', { i: 1, j: 2 }))
  })

  test('the request asks for a box, closed=0 for open notes, closed=-1 for all', () => {
    const bbox = [13.4, 52.4, 13.45, 52.45] as const
    expect(notesUrl('http://localhost:8090/s/small/', [...bbox], 'open')).toBe(
      'http://localhost:8090/s/small/api/0.6/notes.json?bbox=13.4,52.4,13.45,52.45&closed=0&limit=100',
    )
    expect(notesUrl('http://localhost:8090/s/small', [...bbox], 'all')).toContain('closed=-1')
  })
})

describe('checking the answer', () => {
  test('a note keeps its position, status, dates and comments, oldest comment first', () => {
    const json = collection([
      feature(9000001, {
        status: 'closed',
        closed_at: '2026-10-01T10:00:00Z',
        comments: [
          { date: '2026-09-30T10:00:00Z', action: 'closed', text: 'Erledigt' },
          {
            date: '2026-09-28T07:14:03Z',
            uid: 910001,
            user: 'Hanna',
            action: 'opened',
            text: 'Poller',
          },
        ],
      }),
    ])
    const { notes, skipped, count } = parseNotes(json)
    expect(skipped).toBe(0)
    expect(count).toBe(1)
    expect(notes[0]).toEqual({
      id: 9000001,
      lon: 13.4,
      lat: 52.389,
      status: 'closed',
      created: '2026-09-28T07:14:03Z',
      closed: '2026-10-01T10:00:00Z',
      comments: [
        {
          date: '2026-09-28T07:14:03Z',
          uid: 910001,
          user: 'Hanna',
          action: 'opened',
          text: 'Poller',
        },
        { date: '2026-09-30T10:00:00Z', action: 'closed', text: 'Erledigt' },
      ],
    })
  })

  test('malformed features are skipped and counted, the others are kept', () => {
    const json = collection([
      feature(9000001),
      feature(9000002, { status: 'hidden' }),
      feature(9000003, { date_created: 'yesterday' }),
      feature(0),
      { type: 'Feature', geometry: { type: 'Point', coordinates: ['13.4', 52.3] }, properties: {} },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [200, 52.3] }, properties: {} },
      feature(9000004, { comments: [{ date: 'x', text: 'no date' }] }),
      feature(9000005, { comments: 'none' }),
      null,
      'a string',
    ])
    const { notes, skipped, count } = parseNotes(json)
    expect(count).toBe(10)
    expect(notes.map((n) => n.id)).toEqual([9000001])
    expect(skipped).toBe(9)
  })

  test('malformed comments are dropped, a note with one good comment stays', () => {
    const json = collection([
      feature(9000001, {
        comments: [{ text: 'no date' }, { date: '2026-09-28T07:14:03Z', text: 'Gut' }, 4],
      }),
    ])
    const { notes } = parseNotes(json)
    expect(notes[0]?.comments.map((c) => c.text)).toEqual(['Gut'])
  })

  test('an answer that is not a collection throws', () => {
    expect(() => parseNotes({ type: 'Feature' })).toThrow()
    expect(() => parseNotes(null)).toThrow()
    expect(() => parseNotes({ type: 'FeatureCollection', features: 'x' })).toThrow()
  })

  test('the answer of the mock API parses', async () => {
    const json = await Bun.file(
      new URL('../../../fixtures/notes/small.json', import.meta.url),
    ).json()
    const { notes, skipped } = parseNotes(json)
    expect(skipped).toBe(0)
    expect(notes.length).toBe(json.features.length)
  })
})

describe('what a note shows', () => {
  const base: Note = {
    id: 1,
    lon: 13.4,
    lat: 52.4,
    status: 'open',
    created: '2026-09-28T07:14:03Z',
    comments: [{ date: '2026-09-28T07:14:03Z', action: 'opened', text: '' }],
  }

  test('the summary is the first non-empty line of the first comment', () => {
    const note = {
      ...base,
      comments: [
        { date: '2026-09-28T07:14:03Z', action: 'opened', text: '\n  \nErste Zeile\nzweite' },
      ],
    }
    expect(summaryLine(note)).toBe('Erste Zeile')
    expect(summaryLine(base)).toBe('(no text)')
  })

  test('a long summary is cut to one line', () => {
    const line = summaryLine({
      ...base,
      comments: [{ date: '2026-09-28T07:14:03Z', action: 'opened', text: 'x'.repeat(200) }],
    })
    expect(line.length).toBe(80)
    expect(line.endsWith('…')).toBe(true)
  })

  test('open notes come first, the newest first, the id breaks ties', () => {
    const notes: Note[] = [
      { ...base, id: 1, status: 'closed', created: '2026-10-05T00:00:00Z' },
      { ...base, id: 2, status: 'open', created: '2026-08-01T00:00:00Z' },
      { ...base, id: 3, status: 'open', created: '2026-09-01T00:00:00Z' },
      { ...base, id: 4, status: 'open', created: '2026-09-01T00:00:00Z' },
      { ...base, id: 5, status: 'closed', created: '2026-01-01T00:00:00Z' },
    ]
    expect(sortNotes(notes).map((n) => n.id)).toEqual([4, 3, 2, 1, 5])
  })

  test('the notes in a box, closed ones only when asked', () => {
    const notes: Note[] = [
      { ...base, id: 1, lon: 13.4, lat: 52.4 },
      { ...base, id: 2, lon: 13.5, lat: 52.4 },
      { ...base, id: 3, lon: 13.4, lat: 52.4, status: 'closed' },
    ]
    const box = [13.39, 52.39, 13.41, 52.41] as const
    expect(notesIn(notes, [...box], false).map((n) => n.id)).toEqual([1])
    expect(notesIn(notes, [...box], true).map((n) => n.id)).toEqual([1, 3])
  })

  test('dates are shown in UTC, without a locale', () => {
    expect(formatDate('2026-09-28T07:14:03Z')).toBe('2026-09-28 07:14')
    expect(formatDate('not a date')).toBe('not a date')
  })

  test('the web page of a note is a link, the id is all it needs', () => {
    expect(noteWebUrl(9000001)).toBe('https://www.openstreetmap.org/note/9000001')
  })

  test('markers carry id, status and whether they are chosen', () => {
    const markers = markersOf([base], 1)
    expect(markers.features[0]?.properties).toEqual({ id: 1, status: 'open', chosen: true })
    expect(markers.features[0]?.geometry.coordinates).toEqual([13.4, 52.4])
  })
})
