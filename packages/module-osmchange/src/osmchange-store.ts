/**
 * The import that is open: the file, what the server had when it was loaded, the person's choices, and whether it was
 * applied. One store per module (the module makes it in its setup).
 *
 * The server states are kept here and not in the editor's query client: they are the result of one action of the
 * person (loading this file), the merge must stay on exactly that state while the person decides, and they are
 * dropped when the import is closed. Nothing is fetched again behind the person's back.
 *
 * The store is private: components read it with the named hooks below and act through `actions`.
 */
import { createStore, useStore } from 'zustand'
import type { Matches } from './match.ts'
import type { Choice } from './merge.ts'
import type { Message, OsmChangeFile, ServerState } from './types.ts'

export type Session = {
  readonly fileName: string
  readonly file: OsmChangeFile
  readonly states: ReadonlyMap<string, ServerState>
  readonly parents: ReadonlyMap<string, readonly string[]>
  /** The new elements that are on the server already, and possible duplicates (match.ts) */
  readonly matches: Matches
  readonly requests: number
}

/**
 * The last file loaded, for the changeset: who made it and which elements it touched (the editor's ids, new ones
 * included). Replaced by the next file, dropped after an upload.
 */
export type Imported = {
  readonly fileName: string
  readonly generator?: string
  readonly ids: ReadonlySet<string>
}

export type OsmChangeActions = {
  readonly start: (fileName: string) => void
  readonly fail: (error: Message) => void
  /** The file is loaded and what needed no decision is written; `created` are the editor's ids of its new elements */
  readonly open: (
    session: Session,
    created: ReadonlyMap<string, string>,
    loaded: ReadonlySet<string>,
  ) => void
  /**
   * A choice, and what its write touched (the element's key and the editor's ids), so that changing it later reverts
   * exactly that first. An empty `touched` forgets an earlier write (the choice came back to the server's state).
   */
  readonly choose: (
    conflictId: string,
    choice: Choice,
    wrote?: { readonly key: string; readonly touched: readonly string[] },
  ) => void
  readonly toggleHighlight: () => void
  /** After an upload, and when the editor goes: the review and what it kept for the changeset are done */
  readonly close: () => void
}

export type OsmChangeState = {
  /** The name of the file being read, while it is read and the server is asked */
  readonly loading: string | undefined
  readonly error: Message | undefined
  readonly session: Session | undefined
  readonly choices: Readonly<Record<string, Choice>>
  /** The editor's ids of the file's new elements, from the write on loading */
  readonly created: ReadonlyMap<string, string>
  /** The editor's ids the write on loading touched, to tell whether it was undone (editor-io.ts `stillApplied`) */
  readonly loaded: ReadonlySet<string>
  /** What each element's decision wrote, by the element's key: the editor's ids it touched */
  readonly decided: ReadonlyMap<string, readonly string[]>
  /** Whether the map shows the file's changes in their colours */
  readonly highlight: boolean
  readonly imported: Imported | undefined
  readonly actions: OsmChangeActions
}

export type OsmChangeStore = ReturnType<typeof createOsmChangeStore>

const EMPTY = {
  loading: undefined,
  error: undefined,
  session: undefined,
  choices: {},
  created: new Map<string, string>(),
  loaded: new Set<string>(),
  decided: new Map<string, readonly string[]>(),
  highlight: true,
}

export function createOsmChangeStore() {
  return createStore<OsmChangeState>()((set) => ({
    ...EMPTY,
    imported: undefined,
    actions: {
      start: (fileName) => set({ ...EMPTY, loading: fileName, imported: undefined }),
      fail: (error) => set({ loading: undefined, error }),
      open: (session, created, loaded) =>
        set({
          loading: undefined,
          error: undefined,
          session,
          created,
          loaded,
          imported: {
            fileName: session.fileName,
            ...(session.file.generator ? { generator: session.file.generator } : {}),
            ids: new Set([...session.states.keys(), ...created.values()]),
          },
        }),
      choose: (conflictId, choice, wrote) =>
        set((state) => ({
          choices: { ...state.choices, [conflictId]: choice },
          decided: wrote ? new Map([...state.decided, [wrote.key, wrote.touched]]) : state.decided,
        })),
      toggleHighlight: () => set((state) => ({ highlight: !state.highlight })),
      close: () => set({ ...EMPTY, imported: undefined }),
    },
  }))
}

export const useOsmChangeLoading = (store: OsmChangeStore) =>
  useStore(store, (state) => state.loading)
export const useOsmChangeError = (store: OsmChangeStore) => useStore(store, (state) => state.error)
export const useOsmChangeSession = (store: OsmChangeStore) =>
  useStore(store, (state) => state.session)
export const useOsmChangeChoices = (store: OsmChangeStore) =>
  useStore(store, (state) => state.choices)
export const useOsmChangeCreated = (store: OsmChangeStore) =>
  useStore(store, (state) => state.created)
export const useOsmChangeLoaded = (store: OsmChangeStore) =>
  useStore(store, (state) => state.loaded)
export const useOsmChangeHighlight = (store: OsmChangeStore) =>
  useStore(store, (state) => state.highlight)
export const useOsmChangeActions = (store: OsmChangeStore) =>
  useStore(store, (state) => state.actions)
