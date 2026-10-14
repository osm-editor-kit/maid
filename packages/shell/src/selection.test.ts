import { describe, expect, test } from 'bun:test'
import { idParam, idsOfParam, mirrorSelection, type SelectionEngine } from './selection'

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
})

describe('engine to URL: one write per change of the engine', () => {
  test('an operation that selects another feature writes id once, with the new value', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection(engine, url.start, url.write)

    // runOperation: the operation's selection, set by the engine
    engine.setSelected(['n5'])

    expect(url.writes).toEqual(['n5'])
  })

  test('a filter that hides the selected feature clears id, once', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection(engine, url.start, url.write)

    // setFilters: the selection without the hidden feature
    engine.setSelected([])

    expect(url.writes).toEqual([null])
  })

  test('a lens or a reload that keeps only some of several ids writes the rest', () => {
    const engine = fakeEngine(['w1', 'n2', 'n3'])
    const url = urlWrites('w1,n2,n3')
    mirrorSelection(engine, url.start, url.write)

    engine.setSelected(['w1', 'n3'])

    expect(url.writes).toEqual(['w1,n3'])
  })

  test('a click that selects the feature already selected writes nothing', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection(engine, url.start, url.write)

    engine.setSelected(['w10'])

    expect(url.writes).toEqual([])
  })

  test('a notification that leaves the selection as it was writes nothing', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    let notify: (() => void) | undefined
    const subscribe = engine.subscribe
    engine.subscribe = (listener) => {
      notify = listener
      return subscribe(listener)
    }
    mirrorSelection(engine, url.start, url.write)

    // a merge of data notifies with the selection unchanged
    notify?.()

    expect(url.writes).toEqual([])
  })

  test('a selection made before the mirror existed is not written until it changes', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    mirrorSelection(engine, url.start, url.write)
    engine.setSelected(['w10', 'n5'])
    engine.setSelected(['w10', 'n5'])
    expect(url.writes).toEqual(['w10,n5'])
  })
})

describe('URL to engine: a change of id from outside selects in the engine, without writing back', () => {
  test('back or forward selects what the URL names, and does not write the URL', () => {
    const engine = fakeEngine(['n5'])
    const url = urlWrites('n5')
    const mirror = mirrorSelection(engine, url.start, url.write)

    mirror.fromUrl('w10')

    expect(engine.selection).toEqual(['w10'])
    expect(url.writes).toEqual([])
  })

  test('a link with several ids selects them in order and writes nothing', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const mirror = mirrorSelection(engine, url.start, url.write)

    mirror.fromUrl('w1,n2')

    expect(engine.selection).toEqual(['w1', 'n2'])
    expect(url.writes).toEqual([])
  })

  test('the URL without id clears the selection, and writes nothing', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection(engine, url.start, url.write)

    mirror.fromUrl(null)

    expect(engine.selection).toEqual([])
    expect(url.writes).toEqual([])
  })

  test('the URL value the engine just wrote is not selected again', () => {
    const engine = fakeEngine(['w10'])
    const calls = { select: 0 }
    const url = urlWrites('w10')
    const mirror = mirrorSelection(engine, url.start, url.write, (ids) => {
      calls.select++
      engine.setSelected(ids)
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
    const mirror = mirrorSelection(engine, url.start, url.write, () => calls.select++)

    mirror.fromUrl('w10')

    expect(calls.select).toBe(0)
  })

  test('back to an id the engine had before selects it again, and then the engine writes nothing more', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection(engine, url.start, url.write)

    engine.setSelected(['n5']) // write n5
    mirror.fromUrl('w10') // Back: select w10 (no write)
    engine.setSelected(['w10']) // already selected: no change, no write

    expect(engine.selection).toEqual(['w10'])
    expect(url.writes).toEqual(['n5'])
  })

  test('an id the engine does not have loaded yet is kept as the selection, as the start id is', () => {
    const engine = fakeEngine()
    const url = urlWrites(null)
    const mirror = mirrorSelection(engine, url.start, url.write)

    mirror.fromUrl('w999')

    expect(engine.selection).toEqual(['w999'])
    expect(url.writes).toEqual([])
  })
})

describe('the start value and the end of the mirror', () => {
  test('the start value is not selected or written when the mirror is made', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection(engine, url.start, url.write)
    mirror.fromUrl('w10')
    expect(url.writes).toEqual([])
  })

  test('after dispose the engine no longer writes the URL', () => {
    const engine = fakeEngine(['w10'])
    const url = urlWrites('w10')
    const mirror = mirrorSelection(engine, url.start, url.write)
    mirror.dispose()

    engine.setSelected(['n5'])

    expect(url.writes).toEqual([])
  })

  test('an empty start value is null, so the first selection is written', () => {
    const engine = fakeEngine()
    const url = urlWrites('')
    mirrorSelection(engine, url.start || null, url.write)
    engine.setSelected(['n5'])
    expect(url.writes).toEqual(['n5'])
  })
})
