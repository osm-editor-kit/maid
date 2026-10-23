/**
 * The plan of a whole file: one item per element with its merge, in the order the review shows them (decisions first,
 * then what was merged without a question, then the rest).
 */
import { type Matches, resolveFile } from './match.ts'
import { choiceOf, type Choice, type Conflict, mergeChange, type Merged } from './merge.ts'
import { keyOf, type FileChange, type OsmChangeFile, type ServerState } from './types.ts'

export type PlanItem = Merged & {
  /** The editor's id of the element in the file: `n123`, or `n-1` for a new one */
  readonly key: string
  /** The change, with references to new elements that exist already resolved to them (match.ts) */
  readonly change: FileChange
  readonly server?: ServerState
}

const NO_MATCHES: Matches = { same: new Map(), duplicates: new Map() }

/**
 * A new element that is on the server already, or that may duplicate one (match.ts): skipped, or a decision between
 * creating it anyway (`file`) and using the existing one (`current`).
 */
function mergeCreate(
  change: FileChange,
  key: string,
  matches: Matches,
  choices: Readonly<Record<string, Choice>>,
): Merged | undefined {
  const same = matches.same.get(key)
  if (same)
    return {
      status: 'skip',
      conflicts: [],
      notes: [{ id: 'osmchange_note_already_created', values: { id: same } }],
      result: undefined,
    }
  const candidates = matches.duplicates.get(key)
  if (!candidates) return undefined
  const conflict: Conflict = { id: `${key}:duplicate`, kind: 'duplicate', candidates }
  const choice = choices[conflict.id]
  return {
    status: 'decide',
    conflicts: [conflict],
    notes: [],
    result: choice === 'file' ? change.element : undefined,
  }
}

/** The existing element each new one stands for: the same one on the server, or the duplicate the person chose */
function usedInstead(matches: Matches, choices: Readonly<Record<string, Choice>>) {
  const use = new Map(matches.same)
  for (const [key, candidates] of matches.duplicates) {
    const first = candidates[0]
    if (first && choices[`${key}:duplicate`] === 'current') use.set(key, first.key)
  }
  return use
}

export type Plan = {
  readonly items: readonly PlanItem[]
  readonly counts: Readonly<Record<PlanItem['status'], number>>
  /** Conflicts that still need a choice */
  readonly open: number
  /** Whether "Apply" may run: no open conflict and something to write */
  readonly ready: boolean
}

function changesByKey(file: OsmChangeFile) {
  return new Map(
    file.changes.map((change) => [keyOf(change.element.type, change.element.id), change]),
  )
}

const ORDER: Record<PlanItem['status'], number> = { decide: 0, auto: 1, clean: 2, skip: 3 }

/**
 * Who still uses an element the file deletes: its parents on the server (`parents`, from the editor's data after
 * loading), less those the file deletes too or changes so that they no longer refer to it.
 */
export function usedByOf(
  file: OsmChangeFile,
  key: string,
  parents: readonly string[],
  changes: ReadonlyMap<string, FileChange> = changesByKey(file),
) {
  return parents.filter((parent) => {
    const change = changes.get(parent)
    if (!change) return true
    if (change.action === 'delete') return false
    const { element } = change
    const refs = [
      ...(element.nodes ?? []).map((ref) => keyOf('node', ref)),
      ...(element.members ?? []).map((member) => keyOf(member.type, member.ref)),
    ]
    return refs.includes(key)
  })
}

export function planOf(
  file: OsmChangeFile,
  states: ReadonlyMap<string, ServerState>,
  parents: ReadonlyMap<string, readonly string[]>,
  choices: Readonly<Record<string, Choice>>,
  matches: Matches = NO_MATCHES,
): Plan {
  const resolved = resolveFile(file, usedInstead(matches, choices))
  // once for the whole file: every delete asks it
  const byKey = changesByKey(resolved)
  const items: PlanItem[] = resolved.changes.map((change) => {
    const key = keyOf(change.element.type, change.element.id)
    const server = states.get(key)
    const usedBy =
      change.action === 'delete' ? usedByOf(resolved, key, parents.get(key) ?? [], byKey) : []
    const merged =
      (change.action === 'create' ? mergeCreate(change, key, matches, choices) : undefined) ??
      mergeChange(change, server, choices, usedBy)
    return { ...merged, key, change, ...(server ? { server } : {}) }
  })
  // stable: within a status the file's order stays
  items.sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const counts = { decide: 0, auto: 0, clean: 0, skip: 0 }
  let open = 0
  for (const item of items) {
    counts[item.status]++
    for (const conflict of item.conflicts) if (choiceOf(conflict, choices) === undefined) open++
  }
  const writes = items.some((item) => item.result !== undefined)
  return { items, counts, open, ready: open === 0 && writes }
}
