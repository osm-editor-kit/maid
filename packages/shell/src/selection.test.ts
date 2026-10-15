import { describe, expect, test } from 'bun:test'
import {
  idParam,
  idsOfParam,
  mirrorSelection,
  type NoteLink,
  paramOfSelection,
  parseIdEntry,
  parseIdParam,
  type SelectionEngine,
} from './selection'

/**
 * A stand-in for the engine's selection: it notifies its listeners on every call of setSelected that changes the
 * selection, as MaidEngine does (engine-selection.test.ts checks the real one). The engine-driven changes below
 * are calls of setSelected, the one place the engine changes its selection.
 */
function fakeEngine(initial: string[] = []) {
  let selection = [...initial]
  const listeners = new Set<() => void>()
  const engine: SelectionEngine & { calls: number } = {
    calls: 0,
    get selection() {
      return selection
    },
    setSelected(next) {
      this.calls++
      if (next.length === selection.length && next.every((id, i) => id === selection[i])) return
      selection = [...next]
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return engine
}

/**
 * A stand-in for the notes module's note selection: the chosen note, its listeners, and the selects asked for. A select
 * chooses at once here (the real one loads first, see note-selection.test.ts in module-notes).
 */
function fakeNotes(initial: number | null = null) {
  let chosen = initial
  const listeners = new Set<(note: number | null) => void>()
  const selects: { note: number; moveTo: boolean }[] = []
  const set = (note: number | null) => {
    if (note === chosen) return
    chosen = note
    for (const listener of listeners) listener(note)
  }
  const note: NoteLink = {
    current: () => chosen,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async select(id, options) {
      selects.push({ note: id, moveTo: options.moveTo })
      set(id)
    },
    clear: () => set(null),
  }
  return { note, selects, choose: set }
}

/** The URL's `id` as the mirror writes it: one entry per write, in order */
function urlWrites(start: string | null = null) {
  const writes: (string | null)[] = []
  return { writes, write: (value: string | null) => writes.push(value), start }
}

describe('the id parameter', () => {
  test('ids are joined with commas, and none is null', () => {
    expect(idParam([])).toBeNull()
    expect(idParam(['w1'])).toBe('w1')
    expect(idParam(['w1', 'n2'])).toBe('w1,n2')
    expect(idsOfParam(null)).toEqual([])
    expect(idsOfParam('')).toEqual([])
    expect(idsOfParam('w1,n2')).toEqual(['w1', 'n2'])
  })

  test('an OSM entry in the engine form stays as it is', () => {
    expect(parseIdEntry('n1')).toEqual({ osm: 'n1' })
    expect(parseIdEntry('w2')).toEqual({ osm: 'w2' })
    expect(parseIdEntry('r3')).toEqual({ osm: 'r3' })
    expect(parseIdEntry('n-1')).toEqual({ osm: 'n-1' })
  })

  test('iD long forms are read as the engine form: node/1 is n1, way/2 is w2, relation/3 is r3', () => {
    expect(parseIdEntry('node/1')).toEqual({ osm: 'n1' })
    expect(parseIdEntry('way/2')).toEqual({ osm: 'w2' })
    expect(parseIdEntry('relation/3')).toEqual({ osm: 'r3' })
  })

  test('note/123 is a note, and the note forms that are not notes are not read', () => {
    expect(parseIdEntry('note/123')).toEqual({ note: 123 })
    expect(parseIdEntry('note/0')).toBeNull()
    expect(parseIdEntry('note/x')).toBeNull()
    expect(parseIdEntry('nodes/1')).toBeNull()
    expect(parseIdEntry('')).toBeNull()
  })

  test('the parameter as a selection: long forms in order, one note alone, a note among others left out', () => {
    expect(parseIdParam(null)).toEqual({ ids: [], note: null })
    expect(parseIdParam('node/1')).toEqual({ ids: ['n1'], note: null })
    expect(parseIdParam('node/1,way/2')).toEqual({ ids: ['n1', 'w2'], note: null })
    expect(parseIdParam('note/123')).toEqual({ ids: [], note: 123 })
    expect(parseIdParam('note/123,w1')).toEqual({ ids: ['w1'], note: null })
    expect(parseIdParam('n1,note/2')).toEqual({ ids: ['n1'], note: null })
  })

  test('a selection is written as its ids, else as the note, else nothing', () => {
    expect(paramOfSelection({ ids: [], note: null })).toBeNull()
    expect(paramOfSelection({ ids: ['w1', 'n2'], note: null })).toBe('w1,n2')
    expect(paramOfSelection({ ids: [], note: 5 })).toBe('note/5')
    expect(paramOfSelection({ ids: ['w1'], note: 5 })).toBe('w1')
  })
})

describe('engine to URL: one write per change of the engine', () => {
  test('an operation that selects another feature writes id once, with the new value', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection({ engine, start: url.start, write: url.write })

    // runOperation: the operation's selection, set by the engine
    engine.setSelected(['n5'])

    expect(url.writes).toEqual(['n5'])
  })

  test('a filter that hides the selected feature clears id, once', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection({ engine, start: url.start, write: url.write })

    // setFilters: the selection without the hidden feature
    engine.setSelected([])

    expect(url.writes).toEqual([null])
  })

  test('a lens or a reload that keeps only some of several ids writes the rest', () => {
    const engine = fakeEngine(['w1', 'n2', 'n3'])
    const url = urlWrites('w1,n2,n3')
    mirrorSelection({ engine, start: url.start, write: url.write })

    engine.setSelected(['w1', 'n3'])

    expect(url.writes).toEqual(['w1,n3'])
  })

  test('a click that selects the feature already selected writes nothing', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection({ engine, start: url.start, write: url.write })

    engine.setSelected(['w10'])

    expect(url.writes).toEqual([])
  })

  test('a notification that leaves the selection as it was writes nothing', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    let notify: (() => void) | undefined
    const subscribe = engine.subscribe.bind(engine)
    engine.subscribe = (listener) => {
      notify = listener
      return subscribe(listener)
    }
    mirrorSelection({ engine, start: url.start, write: url.write })

    // a merge of data notifies with the selection unchanged
    notify?.()

    expect(url.writes).toEqual([])
  })

  test('a selection made before the mirror existed is not written until it changes', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection({ engine, start: url.start, write: url.write })
    engine.setSelected(['w10', 'n5'])
    engine.setSelected(['w10', 'n5'])
    expect(url.writes).toEqual(['w10,n5'])
  })

  test('a start id in iD long form is the same selection as its engine form: no write until it changes', () => {
    const engine = fakeEngine(['n1'])
    const url = urlWrites('node/1')
    mirrorSelection({ engine, start: url.start, write: url.write })
    engine.setSelected(['n1'])
    expect(url.writes).toEqual([])
    engine.setSelected(['n2'])
    expect(url.writes).toEqual(['n2'])
  })
})

describe('URL to engine: a change of id from outside selects in the engine, without writing back', () => {
  test('back or forward selects what the URL names, and does not write the URL', () => {
    const engine = fakeEngine(['n5'])
    const url = urlWrites('n5')
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })

    mirror.fromUrl('w10')

    expect(engine.selection).toEqual(['w10'])
    expect(url.writes).toEqual([])
  })

  test('a link with several ids selects them in order and writes nothing', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })

    mirror.fromUrl('w1,n2')

    expect(engine.selection).toEqual(['w1', 'n2'])
    expect(url.writes).toEqual([])
  })

  test('a link in iD long form selects the engine form', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })

    mirror.fromUrl('node/1,way/2')

    expect(engine.selection).toEqual(['n1', 'w2'])
    expect(url.writes).toEqual([])
  })

  test('the URL without id clears the selection, and writes nothing', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })

    mirror.fromUrl(null)

    expect(engine.selection).toEqual([])
    expect(url.writes).toEqual([])
  })

  test('the URL value the engine just wrote is not selected again', () => {
    const engine = fakeEngine(['w10'])
    const calls = { select: 0 }
    const url = urlWrites('w10')
    const mirror = mirrorSelection({
      engine,
      start: url.start,
      write: url.write,
      select: (ids) => {
        calls.select++
        engine.setSelected(ids)
      },
    })

    engine.setSelected(['n5']) // written: n5
    mirror.fromUrl('n5') // the URL catches up with the write

    expect(url.writes).toEqual(['n5'])
    expect(calls.select).toBe(0)
    expect(engine.selection).toEqual(['n5'])
  })

  test('a URL value that equals the current selection does not call the engine', () => {
    const engine = fakeEngine(['w10'])
    const calls = { select: 0 }
    const url = urlWrites('w10')
    const mirror = mirrorSelection({
      engine,
      start: url.start,
      write: url.write,
      select: () => calls.select++,
    })

    mirror.fromUrl('w10')

    expect(calls.select).toBe(0)
  })

  test('back to an id the engine had before selects it again, and then the engine writes nothing more', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })

    engine.setSelected(['n5']) // write n5
    mirror.fromUrl('w10') // Back: select w10 (no write)
    engine.setSelected(['w10']) // already selected: no change, no write

    expect(engine.selection).toEqual(['w10'])
    expect(url.writes).toEqual(['n5'])
  })

  test('an id the engine does not have loaded yet is kept as the selection, as the start id is', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })

    mirror.fromUrl('w999')

    expect(engine.selection).toEqual(['w999'])
    expect(url.writes).toEqual([])
  })
})

describe('the start value and the end of the mirror', () => {
  test('the start value is not selected or written when the mirror is made', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })
    mirror.fromUrl('w10')
    expect(url.writes).toEqual([])
  })

  test('after dispose the engine no longer writes the URL', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection({ engine, start: url.start, write: url.write })
    mirror.dispose()

    engine.setSelected(['n5'])

    expect(url.writes).toEqual([])
  })

  test('an empty start value is null, so the first selection is written', () => {
    const engine = fakeEngine()
    const url = urlWrites('')
    mirrorSelection({ engine, start: url.start, write: url.write })
    engine.setSelected(['n5'])
    expect(url.writes).toEqual(['n5'])
  })
})

describe('notes: the URL follows the chosen note, and one selection at a time', () => {
  test('a note chosen writes id=note/<id>, once', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const notes = fakeNotes()
    mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    notes.choose(5)

    expect(url.writes).toEqual(['note/5'])
  })

  test('deselecting the note removes id', () => {
    const engine = fakeEngine()
    const url = urlWrites('note/5')
    const notes = fakeNotes(5)
    mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    notes.choose(null)

    expect(url.writes).toEqual([null])
  })

  test('an OSM selection replaces the chosen note, with one write', () => {
    const engine = fakeEngine()
    const url = urlWrites('note/5')
    const notes = fakeNotes(5)
    mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    engine.setSelected(['w1'])

    expect(notes.note.current()).toBeNull()
    expect(engine.selection).toEqual(['w1'])
    expect(url.writes).toEqual(['w1'])
  })

  test('a note chosen while an OSM feature is selected takes its place, with one write', () => {
    const engine = fakeEngine(['w1'])
    const url = urlWrites('w1')
    const notes = fakeNotes()
    mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    notes.choose(5)

    expect(engine.selection).toEqual([])
    expect(url.writes).toEqual(['note/5'])
  })

  test('a URL with note/5 selects the note without moving the map, and writes nothing', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const notes = fakeNotes()
    const mirror = mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    mirror.fromUrl('note/5')

    expect(notes.selects).toEqual([{ note: 5, moveTo: false }])
    expect(notes.note.current()).toBe(5)
    expect(url.writes).toEqual([])
  })

  test('a URL with an OSM id after a note clears the note, and writes nothing', () => {
    const engine = fakeEngine()
    const url = urlWrites('note/5')
    const notes = fakeNotes(5)
    const mirror = mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    mirror.fromUrl('w1')

    expect(notes.note.current()).toBeNull()
    expect(engine.selection).toEqual(['w1'])
    expect(url.writes).toEqual([])
  })

  test('the note the URL already names is not selected again', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const notes = fakeNotes()
    const mirror = mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })

    notes.choose(5) // written: note/5
    mirror.fromUrl('note/5')

    expect(notes.selects).toEqual([])
    expect(url.writes).toEqual(['note/5'])
  })

  test('a start note is chosen once when the mirror is made, moving the map only without a map in the URL', () => {
    const engine = fakeEngine()
    const url = urlWrites('note/5')
    const notes = fakeNotes()
    mirrorSelection({
      engine,
      note: notes.note,
      start: url.start,
      startMoveTo: true,
      write: url.write,
    })

    expect(notes.selects).toEqual([{ note: 5, moveTo: true }])
    expect(url.writes).toEqual([])
  })

  test('a start note with a map in the URL is chosen without a move', () => {
    const engine = fakeEngine()
    const url = urlWrites('note/5')
    const notes = fakeNotes()
    mirrorSelection({ engine, note: notes.note, start: url.start, write: url.write })
    expect(notes.selects).toEqual([{ note: 5, moveTo: false }])
  })

  test('without the notes module a note in the URL is no selection, and the first change writes', () => {
    const engine = fakeEngine()
    const url = urlWrites('note/5')
    mirrorSelection({ engine, start: url.start, write: url.write })
    expect(url.writes).toEqual([])
    engine.setSelected(['n5'])
    expect(url.writes).toEqual(['n5'])
  })
})
