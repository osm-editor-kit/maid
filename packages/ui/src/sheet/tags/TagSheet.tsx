import { ArrowsRightLeftIcon, ClipboardDocumentIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { useMemo, useState, type FocusEvent as ReactFocusEvent } from 'react'
import type { CombinedTags } from '../../inspector/fields/shared.ts'
import { notify } from '../../Toast.tsx'
import { Tooltip } from '../../Tooltip.tsx'
import { Sheet } from '../Sheet.tsx'
import type { SheetBatch, SheetClipboard, SheetRow } from '../types.ts'
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
  resortTagModel,
  settleTagModel,
  syncTagModel,
  type TagModel,
} from './tag-model.ts'
import { planTagsPaste, serializeTagCells } from './tag-paste.ts'
import {
  compareSideKeys,
  mergeSides,
  otherSideKey,
  sameTags,
  sidePlaceOf,
  splitBoth,
} from './tag-sides.ts'
import { withTagSuggestions, type TagSuggestSource } from './tag-suggest.ts'
import {
  codeUnits,
  copyAllText,
  describePaste,
  rowKey,
  rowValue,
  TAG_COLUMNS,
  type ReadOnlyKeys,
} from './tags.ts'

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
  /**
   * `exact` (default): the tags as they are stored, sorted as iD does. `sides`: one feature only, the keys of a road's
   * sides grouped (cycleway, sidewalk, parking, with their meta keys such as `source:cycleway:…`) and `:both` shown as
   * left and right; two equal sides are stored as `:both` again (tag-sides.ts). Several features stay `exact`.
   */
  view?: TagView
}

/** How the Tags sheet shows the tags (TagSheetProps.view) */
export type TagView = 'exact' | 'sides'

/**
 * The switch between the two views of the Tags sheet, for the heading of the Tags section: pressed is the sides view.
 */
export function TagViewButton(props: { view: TagView; onChange: (view: TagView) => void }) {
  const sides = props.view === 'sides'
  return (
    <Tooltip label={m.ui_tags_view_sides()} description={m.ui_tags_view_sides_hint()}>
      <button
        type="button"
        aria-pressed={sides}
        aria-label={m.ui_tags_view_sides()}
        onClick={() => props.onChange(sides ? 'exact' : 'sides')}
        className={`grid size-7 cursor-pointer place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-blue-500 ${
          sides
            ? 'bg-zinc-950/10 text-zinc-950 hover:bg-zinc-950/15 dark:bg-white/15 dark:text-white dark:hover:bg-white/20'
            : 'text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
        }`}
      >
        <ArrowsRightLeftIcon className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  )
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
      () => notify.done(m.ui_sheet_copied()),
      () => notify.info(m.ui_sheet_copy_refused()),
    )
  }
  return (
    <Tooltip label={m.ui_copy_all_hint()}>
      <button
        type="button"
        aria-label={m.ui_copy_all()}
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
  const stored = props.tags ?? NO_TAGS
  const sides = !several && props.view === 'sides'
  const compare = sides ? compareSideKeys : codeUnits
  // the tags the rows show: as stored, or with :both as its two sides. One object per stored tags, so the model sees
  // a change only when the tags change.
  const tags = useMemo(() => (sides ? splitBoth(stored) : stored), [sides, stored])
  const [model, setModel] = useState<TagModel>(() =>
    several
      ? initialCombinedModel(featureKey, combined, readOnlyKeys)
      : initialTagModel(featureKey, tags, readOnlyKeys, compare),
  )
  const [note, setNote] = useState<{ text: string }>()
  // The host gave another feature, or other tags: the rows follow (the same state rule as useState's
  // "storing information from previous renders").
  let current = model
  const seen: object = combined ?? tags
  if (model.featureKey !== featureKey) {
    current = several
      ? initialCombinedModel(featureKey, combined, readOnlyKeys)
      : initialTagModel(featureKey, tags, readOnlyKeys, compare)
    setModel(current)
  } else if (!several && model.compare !== compare) {
    // the view was switched: the rows go to their places in the new order, animated
    current = resortTagModel(model, tags, compare, readOnlyKeys)
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
        if (change.label === undefined) return
        // the sides view writes two equal sides as :both again; a change that ends where it began writes nothing
        const next = sides ? mergeSides(change.tags, tags, stored) : change.tags
        if (sides && sameTags(next, stored)) return
        props.onChangeTags?.(next, change.label)
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

  // the sides view: a heading per group, and the other side of the active row tinted when it has the same value
  const groupOf = sides ? (row: SheetRow) => sidePlaceOf(rowKey(row))?.group : undefined
  const relatedRows = sides
    ? (row: SheetRow) => {
        const other = otherSideKey(rowKey(row))
        if (other === undefined) return []
        const match = current.rows.rows.find(
          (candidate) => rowKey(candidate) === other && rowValue(candidate) === rowValue(row),
        )
        return match === undefined || rowValue(row) === '' ? [] : [match.id]
      }
    : undefined

  const copyAll = () => {
    const text = combined !== undefined ? copyAllCombinedText(combined) : copyAllText(stored)
    void navigator.clipboard.writeText(text).then(
      () => setNote({ text: m.ui_sheet_copied() }),
      () => setNote({ text: m.ui_sheet_copy_refused() }),
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
        groupOf={groupOf}
        relatedRows={relatedRows}
      />
      {props.copyButton === false ? null : (
        <div className="flex justify-end">
          <Tooltip label={m.ui_copy_all_hint()}>
            <button
              type="button"
              onClick={copyAll}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white touch:h-10 touch:px-3"
            >
              <ClipboardDocumentIcon className="size-3.5" aria-hidden="true" />
              {m.ui_copy_all()}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
