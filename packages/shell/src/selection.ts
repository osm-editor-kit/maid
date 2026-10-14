import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useEffect, useRef, useState } from 'react'
import { keepNewFeatureOnly } from './new-feature'
import { useShell } from './shell-context'
import { dropStackUnless } from './stack'
import { useSelectedId } from './url/state'

/**
 * What is selected. The engine holds the selection and shows it; the URL holds a mirror of it (`id=w1,n2`, as iD
 * does). `select` changes the engine, and the mirror (`useSelectionMirror`) writes the URL from every change of
 * the engine, whatever its cause. `id` is the first selected entity, the one the inspector shows.
 */
export function useSelection() {
  const { engine } = useShell()
  const [param] = useSelectedId()
  const ids = idsOfParam(param)
  const select = (selection: string | readonly string[] | null) => {
    const next = selection === null ? [] : typeof selection === 'string' ? [selection] : selection
    applySelection(engine, next)
  }
  return { ids, id: ids[0] ?? null, param, select }
}

/**
 * The shell's part of a selection from the UI or the URL, before the engine shows it: a stack keeps its
 * place only for one of its features, and a new feature is no longer new once something else is selected.
 */
export function applySelection(engine: SelectionEngine, next: readonly string[]) {
  // the features of a click's stack keep it; any other selection drops it (stack.ts)
  dropStackUnless(next)
  keepNewFeatureOnly(next)
  engine.setSelected(next)
}

/** The `id` parameter for a selection: its ids joined with commas, or null for none */
export function idParam(ids: readonly string[]): string | null {
  return ids.length > 0 ? ids.join(',') : null
}

/** The ids in an `id` parameter, in order; none for null or an empty value */
export function idsOfParam(param: string | null): string[] {
  return param ? param.split(',') : []
}

/** The part of the engine that the URL mirror uses */
export interface SelectionEngine {
  readonly selection: readonly string[]
  setSelected(selection: readonly string[]): void
  /** Calls the listener on every change of the selection (MaidEngine.subscribe). Returns the unsubscribe. */
  subscribe(listener: () => void): () => unknown
}

export interface SelectionMirror {
  /** The URL's `id` changed from outside the engine (back, forward, a link): the engine selects what it names */
  fromUrl(param: string | null): void
  /** Stops the mirror: the engine no longer writes the URL */
  dispose(): void
}

/**
 * Keeps the URL's `id` a mirror of the engine's selection, in both directions.
 *
 * Engine to URL: the engine calls its listeners on every change of the selection, so `write` runs once per
 * change, with the new value (null for none). A notification that leaves the value as it is writes nothing.
 *
 * URL to engine: `fromUrl` selects what the URL names, through `select` (the shell's `applySelection` in the app).
 *
 * Loop guard: `synced` is the value the URL holds, or is about to hold. The engine's write sets it before the URL
 * is written, so the engine's own change is not selected again; a URL value equal to it is not selected again either.
 *
 * `start` is the value the URL had when the mirror was made. The engine is not told about it here: the map selects
 * the start `id` when it loads (MapView), and the engine keeps an id it does not have loaded yet.
 */
export function mirrorSelection(
  engine: SelectionEngine,
  start: string | null,
  write: (value: string | null) => void,
  select: (ids: readonly string[]) => void = (ids) => engine.setSelected(ids),
): SelectionMirror {
  let synced = start || null
  const unsubscribe = engine.subscribe(() => {
    const value = idParam(engine.selection)
    if (value === synced) return
    synced = value
    write(value)
  })
  return {
    fromUrl(param) {
      const value = param || null
      if (value === synced) return
      synced = value
      select(idsOfParam(value))
    },
    dispose() {
      unsubscribe()
    },
  }
}

/**
 * Makes the URL's `id` follow the engine's selection, and the engine follow a change of `id` from outside
 * (back, forward, a link). Mounted once, by the map. The URL is written with `history: 'replace'` as before.
 */
export function useSelectionMirror(engine: MaidEngine) {
  const [param, setParam] = useSelectedId()
  // the value at mount: the map selects it when it loads (see mirrorSelection)
  const [start] = useState(param)
  // the setter of nuqs changes on every render; the mirror keeps the one of the last commit
  const write = useRef<(value: string | null) => void>(() => {})
  const mirror = useRef<SelectionMirror | null>(null)
  useEffect(() => {
    write.current = (value) => void setParam(value)
  })
  useEffect(() => {
    const made = mirrorSelection(
      engine,
      start,
      (value) => write.current(value),
      (ids) => applySelection(engine, ids),
    )
    mirror.current = made
    return () => {
      made.dispose()
      mirror.current = null
    }
  }, [engine, start])
  useEffect(() => {
    mirror.current?.fromUrl(param)
  }, [param])
}
