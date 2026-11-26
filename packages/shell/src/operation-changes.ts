/**
 * The two previews of an operation's tag changes (`Operation.changes`), from one source: on a desktop the box beside the
 * edit menu while the pointer is on the row (`changesDetails`), on a touch device, which has no hover, the confirm
 * dialog before it runs (`askOnTouch`). Merge of areas asks on every device, because the mapper picks values there
 * (`Operation.confirm`); an operation with only `changes` asks on touch only (Tobias, 2026-11-26).
 */
import type {
  Operation,
  OperationChanges,
  OperationConfirm,
  OperationDetails,
} from '@osm-editor-kit/maid-operations'

/** The changes as the edit menu's table: a column "before" and "after" per feature, a row per key that changes */
export function changesDetails(
  changes: OperationChanges | undefined,
): OperationDetails | undefined {
  if (!changes || changes.features.length === 0) return undefined
  const several = changes.features.length > 1
  const columns = changes.features.flatMap((feature) => [
    { label: several ? `${feature.label}: before` : 'Before', id: feature.id },
    { label: several ? `${feature.label}: after` : 'After', id: feature.id },
  ])
  const keys = [
    ...new Set(
      changes.features.flatMap(({ before, after }) =>
        [...Object.keys(before), ...Object.keys(after)].filter((key) => before[key] !== after[key]),
      ),
    ),
  ].sort()
  const rows = keys.map((key) => ({
    label: key,
    cells: changes.features.flatMap(({ before, after }) => [before[key], after[key]]),
  }))
  return { title: changes.title, columns, rows }
}

/** The changes as the confirm dialog's tag diff: one feature as it is, several with their id before each key */
export function changesConfirm(
  changes: OperationChanges | undefined,
): OperationConfirm | undefined {
  if (!changes || changes.features.length === 0) return undefined
  const [only] = changes.features
  if (changes.features.length === 1 && only) {
    return {
      title: changes.title,
      picks: [],
      before: only.before,
      after: only.after,
      submit: changes.submit,
    }
  }
  const prefixed = (pick: 'before' | 'after') =>
    Object.fromEntries(
      changes.features.flatMap((feature) =>
        Object.entries(feature[pick]).map(([key, value]) => [`${feature.label}  ${key}`, value]),
      ),
    )
  return {
    title: changes.title,
    picks: [],
    before: prefixed('before'),
    after: prefixed('after'),
    submit: changes.submit,
  }
}

/**
 * The operation as it runs on a touch device: one that changes tags and has no `confirm` of its own asks with its
 * changes first. Anything else is returned as it is.
 */
export function askOnTouch(operation: Operation, touch: boolean): Operation {
  if (!touch || !operation.changes || operation.confirm) return operation
  const changes = operation.changes.bind(operation)
  return { ...operation, confirm: (context) => changesConfirm(changes(context)) }
}
