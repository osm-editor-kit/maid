import { defineModule, type Editor, type MaidModule } from '@osm-editor-kit/maid-core'
import { OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import type { DockViewProps, InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import {
  createValidator,
  type Fix,
  type Issue,
  type Rule,
  type Validator,
} from '@osm-editor-kit/maid-validation'
import { useSyncExternalStore } from 'react'

/** The validator of one editor and a way for React to hear that its issues changed */
type Store = {
  validator: Validator
  subscribe: (listener: () => void) => () => void
  version: () => number
}

/** Every way of a graph: the base ways that no edit replaced, then the ways of the edits */
function waysOf(graph: Graph): OsmWay[] {
  const ways: OsmWay[] = []
  // an entry in `local` replaces the one in `base`; `undefined` there means deleted
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmWay && !graph.local.entities.has(id)) ways.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmWay) ways.push(entity)
  return ways
}

function createStore(editor: Editor, rules: readonly Rule[]): Store & { stop: () => void } {
  const validator = createValidator(rules)
  const listeners = new Set<() => void>()
  let version = 0
  // The ways the rules compare with, by id. Read once from the whole graph (after loading, or after a
  // merge), then changed by each edit's difference: a way that the edit named is set, or deleted.
  let ways: Map<string, OsmWay> | undefined
  const forget = editor.history.on('merge', () => {
    ways = undefined
    // base data changed other than by edits: the boxes the validator kept are no longer known to be right
    validator.reset()
  })
  // After every finished edit, undo or redo: what the person changed is checked again, and
  // what is no longer changed is no longer reported.
  const stopValidating = editor.history.on('stablechange', (difference) => {
    const head = editor.history.stable.graph
    if (ways) {
      for (const id of difference.changes.keys()) {
        const entity = head.hasEntity(id)
        if (entity instanceof OsmWay) ways.set(id, entity)
        else ways.delete(id)
      }
    } else if (difference.changes.size > 0) {
      ways = new Map(waysOf(head).map((way) => [way.id, way]))
    }
    // the whole difference from the base decides what is kept; the step (this edit's difference, from
    // the stable graph before it) is what is checked again. Before the first change there are no ways
    // to compare with, and an empty step checks nothing.
    const change = {
      base: editor.history.base.graph,
      head,
      changes: editor.history.difference().changes,
    }
    validator.update(change, ways?.values() ?? [], difference.changes)
    version++
    for (const listener of listeners) listener()
  })
  return {
    validator,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    stop: () => {
      forget()
      stopValidating()
    },
  }
}

/**
 * Reads from the validator inside a component. The validator lives outside React, so the React
 * Compiler cannot see that its answers change; passing the version as an argument is what tells it.
 */
function useIssues<T>(store: Store, read: (validator: Validator, version: number) => T): T {
  const version = useSyncExternalStore(store.subscribe, store.version)
  return read(store.validator, version)
}

function applyFix(editor: Editor, issue: Issue, fix: Fix) {
  const { history } = editor
  try {
    history.perform(...fix.actions(history.staging.graph))
    history.commit({ annotation: fix.annotation, selectedIDs: issue.entityIds })
  } catch (error) {
    // a fix that no longer fits the data must not leave half of itself behind
    history.revert()
    throw error
  }
}

const SEVERITY = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
}

function IssueRow(props: {
  editor: Editor
  issue: Issue
  /** Makes the message a button that selects what the issue is about */
  onSelect?: () => void
}) {
  const { editor, issue, onSelect } = props
  return (
    <li className="flex items-start gap-2 border-b border-zinc-950/5 py-1.5 text-xs last:border-0 dark:border-white/5">
      <span
        role="img"
        aria-label={issue.severity}
        className={`mt-1 size-2 shrink-0 rounded-full ${SEVERITY[issue.severity]}`}
      />
      <div className="min-w-0 flex-1">
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className="cursor-pointer text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            {issue.message}
          </button>
        ) : (
          <p>{issue.message}</p>
        )}
        {issue.fixes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {issue.fixes.map((fix) => (
              <button
                key={fix.id}
                type="button"
                onClick={() => applyFix(editor, issue, fix)}
                className="h-6 cursor-pointer rounded-md bg-white px-2 font-medium inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:inset-ring-white/10 dark:hover:bg-zinc-700"
              >
                {fix.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Checks what was changed here after every edit and shows what the rules find: in the
 * inspector for the selected feature, and as a list of everything in the dock ("Issues").
 * What was loaded and not touched is not checked.
 */
export function validation({ rules }: { rules: readonly Rule[] }): MaidModule {
  return defineModule({
    id: 'validation',
    setup(api) {
      const store = createStore(api.editor, rules)

      function EntityIssues({ entity, editor }: InspectorSectionProps) {
        const issues = useIssues(store, (v) => v.issuesFor(entity.id))
        return (
          <ul>
            {issues.map((issue) => (
              <IssueRow key={issue.id} editor={editor} issue={issue} />
            ))}
          </ul>
        )
      }

      function AllIssues({ editor, select }: DockViewProps) {
        const issues = useIssues(store, (v) => v.issues())
        if (issues.length === 0)
          return (
            <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
              No issues in what you changed. Features that were loaded and not touched are not
              checked.
            </p>
          )
        return (
          <ul className="max-w-2xl px-3 py-1">
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                editor={editor}
                issue={issue}
                onSelect={() => select(issue.entityIds[0] ?? null)}
              />
            ))}
          </ul>
        )
      }

      api.register('inspector.section', {
        id: 'validation-issues',
        title: 'Issues',
        when: (entity) => store.validator.issuesFor(entity.id).length > 0,
        component: EntityIssues,
      })
      api.register('dock.view', { id: 'validation', label: 'Issues', component: AllIssues })
      return store.stop
    },
  })
}
