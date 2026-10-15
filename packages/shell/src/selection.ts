import type { Editor } from '@osm-editor-kit/maid-core'
import type { NoteSelection } from '@osm-editor-kit/maid-module-notes'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useEffect, useRef, useState } from 'react'
import { keepNewFeatureOnly } from './new-feature'
import { useShell } from './shell-context'
import { dropStackUnless } from './stack'
import { useCameraParam, useSelectedId } from './url/state'

/**
 * What is selected. The engine holds the OSM selection and shows it; the notes module holds the chosen note. The URL
 * holds a mirror of both: `id=w1,n2` for OSM features, `id=note/5` for a note, as iD does. One selection at a time:
 * an OSM selection takes the place of the note and a note takes the place of the OSM selection (iD's select modes).
 * `id` is the first selected entity, the one the inspector shows.
 */
export function useSelection() {
  const { engine, editor } = useShell()
  const [param] = useSelectedId()
  const { ids } = parseIdParam(param)
  const note = noteSelectionOf(editor)
  const select = (selection: string | readonly string[] | null) => {
    const next = selection === null ? [] : typeof selection === 'string' ? [selection] : selection
    applySelection(engine, next, note)
  }
  return { ids, id: ids[0] ?? null, param, select }
}

/**
 * The shell's part of a selection from the UI or the URL, before the engine shows it, and the chosen note is cleared:
 * any selection of the UI (a click, Escape, a click on open ground) ends a note's selection, as iD's select-note mode ends.
 */
export function applySelection(engine: SelectionEngine, next: readonly string[], note?: NoteLink) {
  setOsmSelection(engine, next)
  note?.clear()
}

/**
 * The engine's selection with the shell's part: a stack keeps its place only for one of its features, and a new
 * feature is no longer new once something else is selected (stack.ts, new-feature.ts). It does not touch the note.
 */
function setOsmSelection(engine: SelectionEngine, next: readonly string[]) {
  dropStackUnless(next)
  keepNewFeatureOnly(next)
  engine.setSelected(next)
}

/** The `id` parameter for a selection: its ids joined with commas, or null for none */
export function idParam(ids: readonly string[]): string | null {
  return ids.length > 0 ? ids.join(',') : null
}

/** The ids in an `id` parameter, in order; none for null or an empty value. The entries are not read: see parseIdParam. */
export function idsOfParam(param: string | null): string[] {
  return param ? param.split(',') : []
}

/** The OSM type letter of each of iD's long forms */
const OSM_TYPE: Record<string, string> = { node: 'n', way: 'w', relation: 'r' }

/** One entry of an `id` value: an OSM feature in the engine's form (`n1`), or a note */
export type IdEntry = { osm: string } | { note: number }

/**
 * One entry of an `id` value, as the shell reads it. `n1`, `w2`, `r3` are the engine's form and stay as they are.
 * iD's long form `node/1`, `way/2`, `relation/3` is read as `n1`, `w2`, `r3` (iD's hash.js shortens it the same way for
 * `zoomToEntities`). `note/5` is a note (hash.js, `moveToNote`). Any other entry with a slash, or an empty one, is not
 * read: null.
 */
export function parseIdEntry(entry: string): IdEntry | null {
  if (entry === '') return null
  const long = /^(node|way|relation)\/(\d+)$/.exec(entry)
  if (long) return { osm: `${OSM_TYPE[long[1]!]}${long[2]}` }
  const note = /^note\/([1-9]\d*)$/.exec(entry)
  if (note) return { note: Number(note[1]) }
  return entry.includes('/') ? null : { osm: entry }
}

/** A selection as the URL names it: the OSM ids in order, and at most one note */
export interface IdSelection {
  ids: string[]
  note: number | null
}

/**
 * The `id` parameter as a selection. One note alone is a note selection, as iD selects a note on load and on a
 * change of the hash (hash.js). Among other entries a note is left out: iD has no form for that either.
 */
export function parseIdParam(param: string | null): IdSelection {
  const entries = idsOfParam(param).map((entry) => parseIdEntry(entry))
  const only = entries.length === 1 ? entries[0] : undefined
  if (only && 'note' in only) return { ids: [], note: only.note }
  return {
    ids: entries.flatMap((entry) => (entry && 'osm' in entry ? [entry.osm] : [])),
    note: null,
  }
}

/**
 * The `id` parameter for a selection: the OSM ids, else the note as `note/<id>`, else null. One selection at a time, so
 * the two do not come together; the ids are written first, as iD writes its entities before a note (hash.js).
 */
export function paramOfSelection(selection: IdSelection): string | null {
  if (selection.ids.length > 0) return idParam(selection.ids)
  return selection.note === null ? null : `note/${selection.note}`
}

/**
 * The notes module's note selection, when the app has the notes module (it registers the item `note.selection`). None
 * without it: a note in a link is then not a selection.
 */
export function noteSelectionOf(editor: Editor): NoteSelection | undefined {
  return editor.registry('note.selection').get('notes')
}

/** The part of the notes module's note selection the mirror uses */
export type NoteLink = Pick<NoteSelection, 'current' | 'subscribe' | 'select' | 'clear'>

/** The part of the engine that the URL mirror uses */
export interface SelectionEngine {
  readonly selection: readonly string[]
  setSelected(selection: readonly string[]): void
  /** Calls the listener on every change of the selection (MaidEngine.subscribe). Returns the unsubscribe. */
  subscribe(listener: () => void): () => unknown
}

export interface SelectionMirror {
  /** The URL's `id` changed from outside the mirror (back, forward, a link): the selection becomes what it names */
  fromUrl(param: string | null): void
  /** Stops the mirror: nothing is written to the URL any more */
  dispose(): void
}

export interface MirrorOptions {
  engine: SelectionEngine
  /** The notes module's note selection; absent when the app has no notes */
  note?: NoteLink
  /** The URL's `id` when the mirror is made */
  start: string | null
  /** Whether a start note moves the map to it: no `map` in the URL, as iD's `!q.map` */
  startMoveTo?: boolean
  /** Writes the URL's `id` (null removes it). The mirror calls it only when the value changes. */
  write: (value: string | null) => void
  /** Selects the OSM ids a URL names. Default: the engine's `setSelected`. The app adds its stack and new-feature rules. */
  select?: (ids: readonly string[]) => void
}

/** The selection a URL value names, with a note only when the app has one (without, a note in a link is nothing) */
function fromParam(param: string | null, hasNotes: boolean): IdSelection {
  const selection = parseIdParam(param)
  return hasNotes ? selection : { ids: selection.ids, note: null }
}

/**
 * Keeps the URL's `id` a mirror of the selection, in both directions. The engine and the note are the two sources.
 *
 * Source to URL: each change of the engine or of the note calls `sync`, which writes the URL only when its value
 * differs from the one the URL holds (`synced`). So one change writes once, and a notification that changes nothing
 * writes nothing.
 *
 * URL to selection: `fromUrl` makes the selection the URL names. Its value is set as `synced` before anything is
 * selected, so the change it causes is not written back. A note is selected without moving the map (iD's hash change).
 *
 * One selection at a time: an OSM selection clears the note, and a chosen note clears the OSM selection. The clearing
 * happens inside the listeners, so the URL sees the new state once.
 *
 * The start value is selected here: a start note is chosen when the mirror is made, moving the map only when the URL
 * has no `map` (`startMoveTo`). The start OSM ids are selected by the map when it loads (MapView), as before.
 */
export function mirrorSelection(options: MirrorOptions): SelectionMirror {
  const { engine, note, write, startMoveTo = false } = options
  const select = options.select ?? ((ids: readonly string[]) => engine.setSelected(ids))
  const current = (): IdSelection => ({ ids: [...engine.selection], note: note?.current() ?? null })
  let synced = paramOfSelection(fromParam(options.start, note !== undefined))
  const sync = () => {
    const value = paramOfSelection(current())
    if (value === synced) return
    synced = value
    write(value)
  }
  const unsubscribes: (() => unknown)[] = [
    engine.subscribe(() => {
      // an OSM selection takes the place of the chosen note
      if (note && engine.selection.length > 0 && note.current() !== null) note.clear()
      sync()
    }),
  ]
  if (note) {
    unsubscribes.push(
      note.subscribe(() => {
        // a chosen note takes the place of the OSM selection
        if (note.current() !== null && engine.selection.length > 0) select([])
        sync()
      }),
    )
  }
  const start = fromParam(options.start, note !== undefined)
  if (note && start.note !== null) void note.select(start.note, { moveTo: startMoveTo })
  return {
    fromUrl(param) {
      const selection = fromParam(param, note !== undefined)
      const value = paramOfSelection(selection)
      if (value === synced) return
      synced = value
      if (note && selection.note !== null) {
        select([])
        void note.select(selection.note, { moveTo: false })
      } else {
        select(selection.ids)
        note?.clear()
      }
    },
    dispose() {
      for (const unsubscribe of unsubscribes) unsubscribe()
    },
  }
}

/**
 * Makes the URL's `id` follow the selection, and the selection follow a change of `id` from outside (back, forward, a
 * link). Mounted once, by the map. The URL is written with `history: 'replace'` as before.
 */
export function useSelectionMirror(engine: MaidEngine) {
  const { editor } = useShell()
  const [param, setParam] = useSelectedId()
  const [mapParam] = useCameraParam()
  // the values at mount: the map selects the start OSM ids when it loads (see mirrorSelection), and a start note is
  // chosen by the mirror, which moves the map to it unless the URL has a `map`
  const [start] = useState(param)
  const [startMoveTo] = useState(mapParam === null)
  const note = noteSelectionOf(editor)
  // the setter of nuqs changes on every render; the mirror keeps the one of the last commit
  const write = useRef<(value: string | null) => void>(() => {})
  const mirror = useRef<SelectionMirror | null>(null)
  useEffect(() => {
    write.current = (value) => void setParam(value)
  })
  useEffect(() => {
    const made = mirrorSelection({
      engine,
      note,
      start,
      startMoveTo,
      write: (value) => write.current(value),
      select: (ids) => setOsmSelection(engine, ids),
    })
    mirror.current = made
    return () => {
      made.dispose()
      mirror.current = null
    }
  }, [engine, note, start, startMoveTo])
  useEffect(() => {
    mirror.current?.fromUrl(param)
  }, [param])
}
