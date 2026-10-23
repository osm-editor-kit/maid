/**
 * Where the module meets the editor: reading a file into a session (parse, then the server through the editor's
 * fetch), writing what needs no decision on loading, and writing each decision when it is made.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import { Graph } from '@osm-editor-kit/maid-model'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { applyPlan } from './apply.ts'
import { focusOf } from './features.ts'
import { type LoadDeps, loadServerState } from './load.ts'
import { type Choice, choiceOf } from './merge.ts'
import { m } from './messages.ts'
import type { OsmChangeStore, Session } from './osmchange-store.ts'
import { parseOsmChange } from './parse.ts'
import { planOf } from './plan.ts'

export function editorDeps(editor: Editor, engine: MaidEngine, apiUrl: string): LoadDeps {
  const graph = () => editor.history.staging.graph
  return {
    apiUrl,
    fetch: (url) => editor.fetch(url),
    loadedVersion: (key) => {
      const entity = graph().hasEntity(key)
      return entity ? entity.version : 'missing'
    },
    edited: () => {
      const { modified, deleted } = editor.history.changes()
      return new Set([...modified, ...deleted].map((entity) => entity.id))
    },
    merge: (elements) => {
      if (elements.length > 0) engine.merge(elements)
    },
    parents: (key) => {
      const entity = graph().hasEntity(key)
      if (!entity) return []
      return [...graph().parentWays(entity), ...graph().parentRelations(entity)].map(
        (parent) => parent.id,
      )
    },
  }
}

/**
 * Reads a file and the server's state for it, and writes at once what needs no decision, as one undo step named after
 * the file (Tobias, 2026-10-23: the changes are in the editor right away; the review only shows them, and undo or a
 * reload takes them back). Errors end up in the store, as a message to show. Resolves with the session when it opened.
 */
export async function importFile(
  store: OsmChangeStore,
  file: { name: string; text: () => Promise<string> },
  deps: LoadDeps,
  editor: Editor,
) {
  const { actions } = store.getState()
  actions.start(file.name)
  const parsed = parseOsmChange(await file.text())
  if (!parsed.ok) {
    actions.fail(parsed.error)
    return undefined
  }
  const loaded = await loadServerState(parsed.file, deps)
  if (!loaded.ok) {
    actions.fail(loaded.error)
    return undefined
  }
  const session: Session = {
    fileName: file.name,
    file: parsed.file,
    states: loaded.states,
    parents: loaded.parents,
    matches: loaded.matches,
    requests: loaded.requests,
  }
  const plan = planOf(session.file, session.states, session.parents, {}, session.matches)
  const clear = plan.items.filter((item) => item.status !== 'decide' && item.result !== undefined)
  let created: ReadonlyMap<string, string> = new Map()
  let written: ReadonlySet<string> = new Set()
  if (clear.length > 0) {
    const applied = applyPlan(plan, editor.context, {
      only: new Set(clear.map((item) => item.key)),
    })
    editor.history.perform(applied.action)
    editor.history.commit({ annotation: m.osmchange_undo({ file: file.name }), selectedIDs: [] })
    created = applied.created
    written = applied.touched
  }
  actions.open(session, created, written)
  return session
}

/**
 * Whether the write on loading is still in the editor: a new element it created is there, and of what it touched at
 * least one still differs from the server's state. An undo of the load step takes all of it back; decisions are then
 * refused, as they would build on new elements that are gone.
 */
export function stillApplied(
  editor: Editor,
  created: ReadonlyMap<string, string>,
  loaded: ReadonlySet<string>,
) {
  const staging = editor.history.staging.graph
  const base = editor.history.base.graph
  if (![...created.values()].every((id) => staging.hasEntity(id) !== undefined)) return false
  return loaded.size === 0 || [...loaded].some((id) => staging.hasEntity(id) !== base.hasEntity(id))
}

/**
 * A choice in a conflict. Once every conflict of the element has one, the element is written as its own undo step;
 * a changed choice first reverts everything the earlier write touched (a new element it created, the ways a delete
 * changed). A choice that comes out as the server's state, with nothing written before, writes nothing.
 */
export function decide(editor: Editor, store: OsmChangeStore, conflictId: string, choice: Choice) {
  const state = store.getState()
  const { session } = state
  if (!session || !stillApplied(editor, state.created, state.loaded)) return
  const choices = { ...state.choices, [conflictId]: choice }
  const plan = planOf(session.file, session.states, session.parents, choices, session.matches)
  const item = plan.items.find((candidate) =>
    candidate.conflicts.some((conflict) => conflict.id === conflictId),
  )
  if (!item) return
  const complete = item.conflicts.every((conflict) => choiceOf(conflict, choices) !== undefined)
  const before = state.decided.get(item.key) ?? []
  if (!complete) {
    state.actions.choose(conflictId, choice)
    return
  }
  const applied = applyPlan(plan, editor.context, {
    only: new Set([item.key]),
    created: state.created,
    revert: before,
  })
  // a trial run on a copy says what the action changes: nothing, with nothing written before, needs no undo step
  applied.action(new Graph(editor.history.staging.graph))
  if (applied.touched.size === 0 && before.length === 0) {
    state.actions.choose(conflictId, choice)
    return
  }
  editor.history.perform(applied.action)
  editor.history.commit({
    annotation: m.osmchange_undo_decision({ id: item.key }),
    selectedIDs: [],
  })
  state.actions.choose(conflictId, choice, { key: item.key, touched: [...applied.touched] })
}

/** Moves the map to what the person should look at first (focusOf: the decisions, else the merged, else the rest) */
export function focusMap(editor: Editor, engine: MaidEngine, session: Session) {
  const plan = planOf(session.file, session.states, session.parents, {}, session.matches)
  const graph = editor.history.staging.graph
  const bounds = focusOf(
    plan,
    (key) => (graph.hasEntity(key) as { loc?: [number, number] } | undefined)?.loc,
  )
  if (bounds) engine.camera.fitBounds(bounds)
}
