import { defineModule, type Editor } from '@osm-editor-kit/maid-core'
import { m } from '@osm-editor-kit/maid-i18n'
import { OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { notify } from '@osm-editor-kit/maid-ui'
import type { DockViewProps, InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import {
  applyOverrides,
  createValidator,
  type Fix,
  type Issue,
  neighbourhoodOf,
  type Overrides,
  parseOverrides,
  type Rule,
  type Validator,
} from '@osm-editor-kit/maid-validation'
import { useState, useSyncExternalStore } from 'react'
import { readParams, stateParams } from '../url/params'
import { ExistingMenu } from './validation-existing-menu.tsx'
import {
  existingActions,
  existingMode,
  showsExisting,
  useExistingMode,
} from './validation-existing-store.ts'
import { createSelectionChecker, whenIdle } from './validation-idle.ts'
import { ignoredIssueIds, ignoredIssues } from './validation-ignored'

/** The reads the views and the inspector's `when` make: the validator's, with the URL's levels applied */
type ValidatorReads = Pick<
  Validator,
  'issues' | 'issuesFor' | 'issuesForAll' | 'ignoredIssues' | 'existingIssuesFor'
>

/** The validator of one editor and a way for React to hear that its issues changed */
type Store = {
  /** The validator itself: validated and updated by the store, not read by the views */
  validator: Validator
  /** What the views read. Every read goes through the URL's levels here, once (iD's `applySeverityOverrides`) */
  reads: ValidatorReads
  /** Asks for the check of a selected feature and its neighbourhood, in idle time (once per selection) */
  select: (entityId: string) => void
  subscribe: (listener: () => void) => () => void
  version: () => number
}

/**
 * The levels of the validation rules that the address gives, as iD's `validationDisable`, `validationWarning` and
 * `validationError` (iD reads them once at start, see `initialHashParams` in core/validator.js). Pure: `search` is
 * the query string. Maid does not write them back to the address.
 */
export function overridesFromSearch(search: string): Overrides {
  const params = readParams(
    {
      validation_disable: stateParams.validation_disable,
      validation_warning: stateParams.validation_warning,
      validation_error: stateParams.validation_error,
    },
    search,
  )
  return parseOverrides({
    disable: params.validation_disable ?? undefined,
    warning: params.validation_warning ?? undefined,
    error: params.validation_error ?? undefined,
  })
}

/** The validator's reads, each with the URL's levels applied: the one place the overrides meet the issues */
function withOverrides(validator: Validator, overrides: Overrides): ValidatorReads {
  return {
    issues: () => applyOverrides(validator.issues(), overrides),
    issuesFor: (entityId) => applyOverrides(validator.issuesFor(entityId), overrides),
    issuesForAll: (entityIds) => applyOverrides(validator.issuesForAll(entityIds), overrides),
    ignoredIssues: () => applyOverrides(validator.ignoredIssues(), overrides),
    existingIssuesFor: (entityId) =>
      applyOverrides(validator.existingIssuesFor(entityId), overrides),
  }
}

/** Every way of a graph: the base ways that no edit replaced, then the ways of the edits */
function waysOf(graph: Graph) {
  const ways: OsmWay[] = []
  // an entry in `local` replaces the one in `base`; `undefined` there means deleted
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmWay && !graph.local.entities.has(id)) ways.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmWay) ways.push(entity)
  return ways
}

/**
 * The sign that the person wants to see the issues of existing data: a fix of one, or an edit of a feature one names.
 * The setting goes to This session (not when it is Always or already This session), with a notice that says so and
 * one button to keep them quiet. The notice is a toast with an action: it needs no room in the inspector, and it stays
 * when the fix has taken the issue away and the section with it.
 */
export function signalExisting() {
  if (!existingActions.signal()) return
  notify.info(m.issues_session_notice(), {
    id: 'validation-existing',
    action: { label: m.issues_keep_quiet(), onClick: () => existingActions.setMode('quiet') },
  })
}

function createStore(
  editor: Editor,
  rules: readonly Rule[],
  overrides: Overrides,
): Store & { stop: () => void } {
  // The presets are read at each run, and the ignored warnings (saved in the browser) are left out of what is shown.
  // The issues of existing data are shown only in the modes that show them (validation-existing-store.ts).
  const validator = createValidator(rules, {
    presets: () => editor.presets,
    ignored: ignoredIssueIds,
    showExisting: () => showsExisting(existingMode()),
  })
  const listeners = new Set<() => void>()
  let version = 0
  const announce = () => {
    version++
    for (const listener of listeners) listener()
  }
  // The ways the rules compare with, by id. Read once from the whole graph (after loading, after a merge, or when the
  // first check on demand needs them), then changed by each edit's difference: a way that the edit named is set, or deleted.
  let ways: Map<string, OsmWay> | undefined
  const currentWays = () => {
    ways ??= new Map(waysOf(editor.history.stable.graph).map((way) => [way.id, way]))
    return ways
  }
  // The selected feature is checked on demand, in idle time, against the loaded data (see validation-idle.ts)
  const checker = createSelectionChecker({
    schedule: whenIdle,
    check: (entityId) => {
      const graph = editor.history.stable.graph
      const { ids } = neighbourhoodOf(graph, entityId)
      validator.checkExisting(graph, ids, currentWays().values())
      announce()
    },
  })
  const forget = editor.history.on('merge', () => {
    ways = undefined
    // base data changed other than by edits: the boxes the validator kept are no longer known to be right, and the
    // existing issues are looked at again for the feature that is selected
    validator.reset()
    checker.forget()
  })
  // the whole difference from the base: what is kept, and what is checked when no step is given
  const wholeChange = () => ({
    base: editor.history.base.graph,
    head: editor.history.stable.graph,
    changes: editor.history.difference().changes,
  })
  // After every finished edit, undo or redo: what the person changed is checked again, and
  // what is no longer changed is no longer reported.
  const stopValidating = editor.history.on('stablechange', (difference) => {
    const head = editor.history.stable.graph
    // an edit of a feature that an issue of existing data names: the person wants to see those (before the update)
    if (
      validator
        .existingIssues()
        .some((issue) => issue.entityIds.some((id) => difference.changes.has(id)))
    )
      signalExisting()
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
    validator.update(wholeChange(), ways?.values() ?? [], difference.changes)
    announce()
  })
  // The presets of a large schema are made after the first picture. The rules that need them said nothing until
  // now: the whole session is checked again, with no step, once they are there.
  const stopPresets = editor.onPresets(() => {
    validator.update(wholeChange(), ways?.values() ?? [])
    announce()
  })
  // An ignore or "show again" changes what is shown, and so does the setting of existing data
  const stopIgnored = ignoredIssues.subscribe(announce)
  const stopMode = existingActions.subscribe(announce)
  return {
    validator,
    reads: withOverrides(validator, overrides),
    select: (entityId) => checker.select(entityId),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    stop: () => {
      forget()
      stopValidating()
      stopPresets()
      stopIgnored()
      stopMode()
    },
  }
}

/**
 * Reads from the validator inside a component. The validator lives outside React, so the React
 * Compiler cannot see that its answers change; passing the version as an argument is what tells it.
 */
function useIssues<T>(store: Store, read: (reads: ValidatorReads, version: number) => T) {
  const version = useSyncExternalStore(store.subscribe, store.version)
  return read(store.reads, version)
}

/** The store of each editor that has the validation module, for the inspector of several features */
const storeOf = new WeakMap<Editor, Store>()

/** Stands in for an editor without the validation module: no issues, and nothing to wait for */
const NO_VALIDATOR = createValidator([])
const NO_STORE: Store = {
  validator: NO_VALIDATOR,
  reads: withOverrides(NO_VALIDATOR, parseOverrides({})),
  select: () => {},
  subscribe: () => () => {},
  version: () => 0,
}

/**
 * The version of the issues of one editor: it changes when the validator's answers change, including when the check on
 * demand of the selected feature finishes. The inspector calls it so that it renders again then, and its `when` of the
 * Issues section is read again (the section appears only when it has issues to show). Constant without the module.
 */
export function useIssuesVersion(editor: Editor): number {
  const store = storeOf.get(editor) ?? NO_STORE
  return useSyncExternalStore(store.subscribe, store.version)
}

/**
 * The issues that involve any of these features, as the inspector of several features shows them
 * (iD's `getSharedEntityIssues`, in the validator's `issuesForAll`). Empty without the module.
 */
export function useSharedIssues(editor: Editor, ids: readonly string[]): readonly Issue[] {
  return useIssues(storeOf.get(editor) ?? NO_STORE, (validator) => validator.issuesForAll(ids))
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

/** One line of a tag diff, as the rule gives it in `data.tagDiff` (iD's TagDiff): `+` added, `-` removed, `~` kept */
type TagLine = { type: '+' | '-' | '~'; key: string; value: string }

/** The tag diff of an issue, when its rule gives one. Read without trusting its shape: a line that does not fit is left out. */
function tagLinesOf(issue: Issue): TagLine[] {
  const diff = issue.data?.tagDiff
  if (!Array.isArray(diff)) return []
  const lines: TagLine[] = []
  for (const item of diff) {
    if (typeof item !== 'object' || item === null) continue
    const { type, key, oldVal, newVal } = item as Record<string, unknown>
    if ((type === '+' || type === '-' || type === '~') && typeof key === 'string') {
      const value = type === '-' ? oldVal : newVal
      lines.push({ type, key, value: typeof value === 'string' ? value : '' })
    }
  }
  return lines
}

const TAG_SIGN = { '+': '+', '-': '−', '~': ' ' }

/**
 * One issue with its fixes: the row of the dock's list, of one feature's inspector and of several. `existing` is an
 * issue of existing data, shown folded: a quieter look, and a fix of it is the sign that the person wants to see them.
 */
export function IssueRow(props: {
  editor: Editor
  issue: Issue
  /** Makes the message a button that selects what the issue is about */
  onSelect?: () => void
  /** The issue is in existing data (the folded line of an inspector) */
  existing?: boolean
}) {
  const { editor, issue, onSelect, existing = false } = props
  const lines = tagLinesOf(issue)
  return (
    <li className="flex items-start gap-2 border-b border-zinc-950/5 py-1.5 text-xs last:border-0 dark:border-white/5">
      <span
        role="img"
        aria-label={issue.severity}
        className={`mt-1 size-2 shrink-0 rounded-full ${existing ? 'bg-zinc-400' : SEVERITY[issue.severity]}`}
      />
      <div className={`min-w-0 flex-1 ${existing ? 'text-zinc-600 dark:text-zinc-400' : ''}`}>
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
        {lines.length > 0 && (
          // a div, not a list: the rows of the dock are the list items
          <div className="mt-0.5 font-mono text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
            {lines.map((line) => (
              <span key={`${line.type}${line.key}`} className="block">
                {TAG_SIGN[line.type]} {line.key}={line.value}
              </span>
            ))}
          </div>
        )}
        {(issue.fixes.length > 0 || issue.severity === 'warning') && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {issue.fixes.map((fix) => (
              <button
                key={fix.id}
                type="button"
                onClick={() => {
                  applyFix(editor, issue, fix)
                  if (existing) signalExisting()
                }}
                className="h-6 cursor-pointer rounded-md bg-white px-2 font-medium inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:inset-ring-white/10 dark:hover:bg-zinc-700"
              >
                {fix.label}
              </button>
            ))}
            {/* only a warning can be ignored: an error stops the upload */}
            {issue.severity === 'warning' && (
              <button
                type="button"
                onClick={() => ignoredIssues.ignore(issue.id)}
                className="h-6 cursor-pointer rounded-md px-2 text-zinc-600 inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:inset-ring-white/10 dark:hover:bg-zinc-700"
              >
                {m.issues_ignore()}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * The issues of existing data of one feature, folded into one grey line that opens on click. They are the issues
 * the person did not cause: shown with their fixes, but quieter. Used in Quiet mode only.
 */
function ExistingFolded({ editor, issues }: { editor: Editor; issues: readonly Issue[] }) {
  const [open, setOpen] = useState(false)
  const count = issues.length
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="cursor-pointer text-xs text-zinc-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400"
      >
        {count === 1 ? m.issues_existing_one() : m.issues_existing_many({ count })}
      </button>
      {open && (
        <ul className="mt-1">
          {issues.map((issue) => (
            <IssueRow key={issue.id} editor={editor} issue={issue} existing />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Checks what was changed here after every edit, and the feature the person selects in idle time, and shows what the
 * rules find: in the inspector for the selected feature, and as a list of everything in the dock ("Issues").
 * Issues in data the person did not change are shown per the setting "Issues in existing data" (Quiet by default).
 */
export function validation({ rules }: { rules: readonly Rule[] }) {
  return defineModule({
    id: 'validation',
    setup(api) {
      // read once at start, as iD does; the levels are not written back to the address
      const overrides = overridesFromSearch(globalThis.location?.search ?? '')
      if (overrides.unsupported.length > 0)
        console.info(
          'Validation: these rules have no level in Maid and are ignored:',
          overrides.unsupported.map((rule) => rule.source).join(', '),
        )
      const store = createStore(api.editor, rules, overrides)
      storeOf.set(api.editor, store)

      function EntityIssues({ entity, editor }: InspectorSectionProps) {
        const mode = useExistingMode()
        const issues = useIssues(store, (v) => v.issuesFor(entity.id))
        // in Quiet mode the issues of existing data are folded; in the other modes they are in the list above
        const folded = useIssues(store, (v) =>
          showsExisting(mode) ? [] : v.existingIssuesFor(entity.id),
        )
        return (
          <div>
            <ExistingMenu />
            <ul>
              {issues.map((issue) => (
                <IssueRow key={issue.id} editor={editor} issue={issue} />
              ))}
            </ul>
            {folded.length > 0 && (
              <ExistingFolded key={entity.id} editor={editor} issues={folded} />
            )}
          </div>
        )
      }

      function AllIssues({ editor, select }: DockViewProps) {
        const mode = useExistingMode()
        const issues = useIssues(store, (v) => v.issues())
        const ignored = useIssues(store, (v) => v.ignoredIssues())
        return (
          <div>
            <div className="flex justify-end px-3 pt-1">
              <ExistingMenu />
            </div>
            {issues.length === 0 ? (
              <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
                {showsExisting(mode) ? m.issues_empty_session() : m.issues_empty_quiet()}
              </p>
            ) : (
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
            )}
            {ignored.length > 0 && (
              <p className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{m.issues_ignored_count({ count: ignored.length })}</span>
                <button
                  type="button"
                  onClick={() => ignoredIssues.showAgain()}
                  className="cursor-pointer underline hover:no-underline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  {m.issues_show_again()}
                </button>
              </p>
            )}
          </div>
        )
      }

      api.register('inspector.section', {
        id: 'validation-issues',
        title: 'Issues',
        // `when` also asks for the check of the feature (once per selection, in idle time): the check is off the
        // click path, and what it finds is read by the section at the next render
        when: (entity) => {
          store.select(entity.id)
          return (
            store.reads.issuesFor(entity.id).length > 0 ||
            store.reads.existingIssuesFor(entity.id).length > 0
          )
        },
        component: EntityIssues,
      })
      api.register('dock.view', { id: 'validation', label: 'Issues', component: AllIssues })
      return store.stop
    },
  })
}
