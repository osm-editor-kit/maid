import { ClipboardDocumentIcon } from '@heroicons/react/16/solid'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { useState, type FocusEvent as ReactFocusEvent } from 'react'
import type { CombinedTags } from '../../inspector/fields/shared.ts'
import { notify } from '../../Toast.tsx'
import { Tooltip } from '../../Tooltip.tsx'
import { Sheet } from '../Sheet.tsx'
import type { SheetBatch, SheetClipboard } from '../types.ts'
import {
  changeCombinedModel,
  copyAllCombinedText,
  initialCombinedModel,
  oneValuesOf,
  syncCombinedModel,
  type TagSheetChange,
} from './tag-combined.ts'
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

type TagSheetCommon = {
  /** A new feature (or another selection) is a new key: the sheet sorts and starts over. */
  featureKey: string
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
  /** The "Copy all" button under the sheet. Default true; false when the place around it shows `CopyTagsButton`. */
  copyButton?: boolean
}

/**
 * "Copy all" as an icon with a tooltip, for a section heading: every tag as key=value lines, the shared ones of
 * several features with `combined`. Says "Copied" as a toast.
 */
export function CopyTagsButton(props: { tags?: Tags; combined?: CombinedTags }) {
  const copy = () => {
    const text =
      props.combined !== undefined
        ? copyAllCombinedText(props.combined)
        : copyAllText(props.tags ?? {})
    void navigator.clipboard.writeText(text).then(
      () => notify.done('Copied'),
      () => notify.info('The browser did not allow the copy'),
    )
  }
  return (
    <Tooltip label="Copy all tags as key=value lines">
      <button
        type="button"
        aria-label="Copy all"
        onClick={copy}
        className="grid size-7 cursor-pointer place-items-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <ClipboardDocumentIcon className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  )
}

/**
 * One feature: `tags`, and `onChangeTags` with the next tags. Several features: `combined` (what they share and
 * where their values differ), and `onChange` with the operations for every feature (TagSheetChange).
 */
export type TagSheetProps = TagSheetCommon &
  (
    | {
        tags: Tags
        onChangeTags: (tags: Tags, label: string) => void
        combined?: undefined
        onChange?: undefined
      }
    | {
        combined: CombinedTags
        onChange: (change: TagSheetChange, label: string) => void
        tags?: undefined
        onChangeTags?: undefined
      }
  )

const NO_TAGS: Tags = {}

/**
 * The tags of one feature, or of several, as a sheet: key and value columns, an empty row at the end, paste and
 * copy of `key=value` text. The rows are state here, kept by the decisions of tag-model.ts and tag-combined.ts;
 * the host gets the tags (one feature) or the operations (several features).
 */
export function TagSheet(props: TagSheetProps) {
  const { featureKey, readOnlyKeys, readOnly = false, onUndo, onRedo, label, suggest } = props
  const combined = props.combined
  const several = combined !== undefined
  const tags = props.tags ?? NO_TAGS
  const [model, setModel] = useState<TagModel>(() =>
    several
      ? initialCombinedModel(featureKey, combined, readOnlyKeys)
      : initialTagModel(featureKey, tags, readOnlyKeys),
  )
  const [note, setNote] = useState<{ text: string }>()
  // The host gave another feature, or other tags: the rows follow (the same state rule as useState's
  // "storing information from previous renders").
  let current = model
  const seen: object = combined ?? tags
  if (model.featureKey !== featureKey) {
    current = several
      ? initialCombinedModel(featureKey, combined, readOnlyKeys)
      : initialTagModel(featureKey, tags, readOnlyKeys)
    setModel(current)
  } else if (model.seen !== seen) {
    current = several
      ? syncCombinedModel(model, combined, readOnlyKeys)
      : syncTagModel(model, tags, readOnlyKeys)
    setModel(current)
  }

  const onSheetChange = readOnly
    ? undefined
    : (batch: SheetBatch) => {
        if (combined !== undefined) {
          const change = changeCombinedModel(current, batch, readOnlyKeys)
          setModel(change.model)
          const refusal = change.refused[0]
          if (refusal !== undefined) setNote({ text: refusal.reason })
          if (change.change !== undefined && change.label !== undefined) {
            props.onChange?.(change.change, change.label)
          }
          return
        }
        const change = changeTagModel(current, tags, batch, readOnlyKeys)
        setModel(change.model)
        const refusal = change.refused[0]
        if (refusal !== undefined) setNote({ text: refusal.reason })
        if (change.label !== undefined) props.onChangeTags?.(change.tags, change.label)
      }

  // The columns are made again when the rows change: the key column leaves out the keys the other rows have, and
  // a mixed value cell offers the values its features have.
  const columns =
    several || suggest !== undefined
      ? withTagSuggestions(TAG_COLUMNS, suggest, current.rows.rows)
      : TAG_COLUMNS

  const clipboard: SheetClipboard = {
    serialize: serializeTagCells,
    plan: (input) =>
      planTagsPaste(input, {
        tags: combined !== undefined ? oneValuesOf(combined) : tags,
        previous: current.rows,
        readOnlyKeys,
      }),
  }

  // Focus left the sheet (not to another part of it): the rows sort and the incomplete rows go.
  const onLeave = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setModel((prev) => settleTagModel(prev))
  }

  const copyAll = () => {
    const text = combined !== undefined ? copyAllCombinedText(combined) : copyAllText(tags)
    void navigator.clipboard.writeText(text).then(
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
      {props.copyButton === false ? null : (
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
      )}
    </div>
  )
}
