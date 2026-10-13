import { ClipboardDocumentIcon } from '@heroicons/react/16/solid'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { useMemo, useState, type FocusEvent as ReactFocusEvent } from 'react'
import { Tooltip } from '../../Tooltip.tsx'
import { Sheet } from '../Sheet.tsx'
import type { SheetBatch, SheetClipboard } from '../types.ts'
import {
  changeTagModel,
  initialTagModel,
  settleTagModel,
  syncTagModel,
  type TagModel,
} from './tag-model.ts'
import { planTagsPaste, serializeTagCells } from './tag-paste.ts'
import { withTagSuggestions, type TagSuggestSource } from './tag-suggest.ts'
import { copyAllText, describePaste, TAG_COLUMNS, type ReadOnlyKeys } from './tags.ts'

export type TagSheetProps = {
  tags: Tags
  /** A new feature is a new key: the sheet sorts and starts over. */
  featureKey: string
  /** Called once per gesture that changes a tag, with the next tags and the undo label. */
  onChangeTags: (tags: Tags, label: string) => void
  /** Keys that are shown and never written. */
  readOnlyKeys?: ReadOnlyKeys
  /** The whole sheet is read-only (a filter made the feature read-only). Still selectable and copyable. */
  readOnly?: boolean
  onUndo?: () => void
  onRedo?: () => void
  /** The grid's aria-label. */
  label: string
  /** Key and value suggestions (taginfo, or any source of that shape). Without it the sheet asks nothing. */
  suggest?: TagSuggestSource
}

/**
 * The tags of one feature as a sheet: key and value columns, an empty row at the end, paste and copy of
 * `key=value` text. The rows are state here, kept by the decisions of tag-model.ts; the host gets the tags.
 */
export function TagSheet(props: TagSheetProps) {
  const {
    tags,
    featureKey,
    onChangeTags,
    readOnlyKeys,
    readOnly = false,
    onUndo,
    onRedo,
    label,
    suggest,
  } = props
  const [model, setModel] = useState<TagModel>(() =>
    initialTagModel(featureKey, tags, readOnlyKeys),
  )
  const [note, setNote] = useState<{ text: string }>()
  // The host gave another feature, or other tags: the rows follow (the same state rule as useState's
  // "storing information from previous renders").
  let current = model
  if (model.featureKey !== featureKey) {
    current = initialTagModel(featureKey, tags, readOnlyKeys)
    setModel(current)
  } else if (model.seen !== tags) {
    current = syncTagModel(model, tags, readOnlyKeys)
    setModel(current)
  }

  const onSheetChange = readOnly
    ? undefined
    : (batch: SheetBatch) => {
        const change = changeTagModel(current, tags, batch, readOnlyKeys)
        setModel(change.model)
        const refusal = change.refused[0]
        if (refusal !== undefined) setNote({ text: refusal.reason })
        if (change.label !== undefined) onChangeTags(change.tags, change.label)
      }

  // The columns are made again when the rows change: the key column leaves out the keys the other rows have.
  const columns = useMemo(
    () => (suggest ? withTagSuggestions(TAG_COLUMNS, suggest, current.rows.rows) : TAG_COLUMNS),
    [suggest, current.rows.rows],
  )

  const clipboard: SheetClipboard = {
    serialize: serializeTagCells,
    plan: (input) => planTagsPaste(input, { tags, previous: current.rows, readOnlyKeys }),
  }

  // Focus left the sheet (not to another part of it): the rows sort and the incomplete rows go.
  const onLeave = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setModel((prev) => settleTagModel(prev))
  }

  const copyAll = () => {
    void navigator.clipboard.writeText(copyAllText(tags)).then(
      () => setNote({ text: 'Copied' }),
      () => setNote({ text: 'The browser did not allow the copy' }),
    )
  }

  return (
    <div className="flex flex-col gap-1" onBlur={onLeave}>
      <Sheet
        label={label}
        columns={columns}
        rows={current.rows.rows}
        onChange={onSheetChange}
        clipboard={clipboard}
        trailingRow={!readOnly}
        showHeader={false}
        describePaste={describePaste}
        orderToken={String(current.version)}
        onUndo={onUndo}
        onRedo={onRedo}
        note={note}
      />
      <div className="flex justify-end">
        <Tooltip label="Copy all tags as key=value lines">
          <button
            type="button"
            onClick={copyAll}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ClipboardDocumentIcon className="size-3.5" aria-hidden="true" />
            Copy all
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
