import { beforeEach, describe, expect, test } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import { QueryClient } from '@tanstack/react-query'
import { noteUrl, parseNoteAnswer } from './model.ts'
import { noteSelectionFor } from './note-selection.ts'
import { notesSessionState, resetNotesSession } from './store.ts'

const API = 'https://api.example.test/'

/** One note as the API's single-note answer gives it (a feature); without comments it is not a note */
const feature = (id: number, withComment = true) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [13.4, 52.389] },
  properties: {
    id,
    status: 'open',
    date_created: '2026-09-28T07:14:03Z',
    comments: withComment
      ? [{ date: '2026-09-28T07:14:03Z', action: 'opened', text: 'Kaputter Poller' }]
      : [],
  },
})

/** An editor with the two things the handle uses: its query client and its fetch. Records the URLs asked. */
function fakeEditor(answer: (url: string) => unknown) {
  const requested: string[] = []
  const editor = {
    queries: new QueryClient(),
    fetch: async (url: string) => {
      requested.push(url)
      return new Response(JSON.stringify(answer(url)))
    },
  }
  return { editor: editor as unknown as Editor, requested }
}

beforeEach(() => {
  resetNotesSession()
})

describe('the note selection', () => {
  test('a note is loaded by id through the editor fetch, chosen, and the notes switch is asked on', async () => {
    const { editor, requested } = fakeEditor(() => feature(5))
    const selection = noteSelectionFor({ editor, apiUrl: API })
    const seen: (number | null)[] = []
    selection.subscribe((note) => seen.push(note))

    await selection.select(5, { moveTo: false })

    expect(requested).toEqual(['https://api.example.test/api/0.6/notes/5.json'])
    expect(selection.current()).toBe(5)
    expect(seen).toEqual([5])
    expect(notesSessionState().turnOn).not.toBeNull()
    // no move without moveTo: the map stays where the link put it
    expect(notesSessionState().focus).toBeNull()
  })

  test('moveTo asks the map to move to the note', async () => {
    const { editor } = fakeEditor(() => feature(5))
    await noteSelectionFor({ editor, apiUrl: API }).select(5, { moveTo: true })
    expect(notesSessionState().focus).toEqual({ id: 5 })
  })

  test('a note that is in the cache is not asked for again', async () => {
    const { editor, requested } = fakeEditor(() => feature(5))
    const selection = noteSelectionFor({ editor, apiUrl: API })
    await selection.select(5, { moveTo: false })
    selection.clear()
    await selection.select(5, { moveTo: false })
    expect(requested).toHaveLength(1)
    expect(selection.current()).toBe(5)
  })

  test('a clear while the note loads wins: the note is not chosen after all', async () => {
    const { editor } = fakeEditor(() => feature(5))
    const selection = noteSelectionFor({ editor, apiUrl: API })
    const pending = selection.select(5, { moveTo: false })
    selection.clear()
    await pending
    expect(selection.current()).toBeNull()
  })

  test('a clear notifies the listeners once, and a clear of nothing notifies nobody', async () => {
    const { editor } = fakeEditor(() => feature(5))
    const selection = noteSelectionFor({ editor, apiUrl: API })
    await selection.select(5, { moveTo: false })
    const seen: (number | null)[] = []
    selection.subscribe((note) => seen.push(note))
    selection.clear()
    selection.clear()
    expect(seen).toEqual([null])
  })

  test('a note the answer does not give as a note (no comment) is not chosen', async () => {
    const { editor } = fakeEditor(() => feature(5, false))
    const selection = noteSelectionFor({ editor, apiUrl: API })
    await selection.select(5, { moveTo: false })
    expect(selection.current()).toBeNull()
    expect(notesSessionState().turnOn).toBeNull()
  })
})

describe('the single-note answer', () => {
  test('the URL of one note, under the API root (a trailing slash does not double)', () => {
    expect(noteUrl('https://api.example.test/', 5)).toBe(
      'https://api.example.test/api/0.6/notes/5.json',
    )
    expect(noteUrl('https://api.example.test', 5)).toBe(
      'https://api.example.test/api/0.6/notes/5.json',
    )
  })

  test('one feature, and a collection of one feature, are the same note', () => {
    expect(parseNoteAnswer(feature(5))?.id).toBe(5)
    expect(parseNoteAnswer({ type: 'FeatureCollection', features: [feature(5)] })?.id).toBe(5)
  })

  test('an empty collection, a bad answer and a note without a comment give none', () => {
    expect(parseNoteAnswer({ type: 'FeatureCollection', features: [] })).toBeNull()
    expect(parseNoteAnswer('not a note')).toBeNull()
    expect(parseNoteAnswer(feature(5, false))).toBeNull()
  })
})
