import { ClipboardDocumentIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { useMemo, useRef, useState, type FocusEvent as ReactFocusEvent } from 'react'
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
import {
  groupHeadings,
  groupSheetRows,
  serializeSides,
  sidesColumns,
  useShortGroups,
  VALUE_SPANS,
} from './tag-sides-view.tsx'
import {
  applySideBatch,
  applySteps,
  combineTags,
  mergeSides,
  sameTags,
  sideLayout,
  isSideRow,
  shownAfterPlain,
  sideSteps,
  splitBoth,
  splitBothSteps,
  stepsOfChange,
  type SideGroupRows,
  type TagStep,
} from './tag-sides.ts'
import { withTagSuggestions, type TagSuggestSource } from './tag-suggest.ts'
import {
  copyAllText,
  describePaste,
  tagChangeLabel,
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
   * `exact` (default): the tags as they are stored, sorted as iD does. `sides`: the tags with no side on top, then the
   * keys of a road's sides (sidewalk, cycleway, parking, with their meta keys such as `source:cycleway:…`) as rows of a
   * key with `{side}`, a left and a right value; `:both` is shown as its two sides and two equal sides are stored as
   * `:both` again (tag-sides.ts). Several features need `features` and `onChangeEach` for it, else they stay `exact`.
   */
  view?: TagView
}

/** How the Tags sheet shows the tags (TagSheetProps.view) */
export type TagView = 'exact' | 'sides'

/**
 * The switch between the two views of the Tags sheet, for the heading of the Tags section: two segments, one of them
 * always on ("Raw": as stored; "Sides": grouped, left and right).
 */
export function TagViewButton(props: { view: TagView; onChange: (view: TagView) => void }) {
  const options: { view: TagView; label: string; hint: string }[] = [
    { view: 'exact', label: m.ui_tags_view_exact(), hint: m.ui_tags_view_exact_hint() },
    { view: 'sides', label: m.ui_tags_view_sides(), hint: m.ui_tags_view_sides_hint() },
  ]
  return (
    <div
      role="radiogroup"
      aria-label={m.ui_tags_view()}
      className="flex h-7 items-center rounded-md bg-zinc-950/5 p-0.5 dark:bg-white/10"
    >
      {options.map((option) => {
        const on = props.view === option.view
        return (
          <Tooltip key={option.view} label={option.label} description={option.hint}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (!on) props.onChange(option.view)
              }}
              className={`h-6 cursor-pointer rounded px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-500 ${
                on
                  ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {option.label}
            </button>
          </Tooltip>
        )
      })}
    </div>
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
        features?: undefined
        onChangeEach?: undefined
      }
    | {
        combined: CombinedTags
        onChange: (change: TagSheetChange, label: string) => void
        /**
         * The sides view for several features needs each feature's tags (each splits and merges its own `:both`) and
         * writes each feature's next tags with `onChangeEach`, as one step. Without them the view stays `exact`.
         */
        features?: readonly { id: string; tags: Tags }[]
        onChangeEach?: (changes: readonly { id: string; tags: Tags }[], label: string) => void
        tags?: undefined
        onChangeTags?: undefined
      }
  )

const NO_TAGS: Tags = {}
const NO_GROUPS: readonly SideGroupRows<unknown>[] = []

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
  // the sides view: the shown tags (:both as its two sides), the ones with no side for the table on top, and the left
  // and right keys of each group as rows of three columns. One object per stored tags, so the model sees a change
  // only when the tags change.
  const shown = useMemo(() => (sides ? splitBoth(stored) : stored), [sides, stored])
  const layout = useMemo(() => (sides ? sideLayout(shown) : undefined), [sides, shown])
  const tags = layout?.plain ?? shown
  // the sides view of several features: each feature's shown tags, and those combined (a side with different values
  // is "Multiple values")
  const features = props.features
  const sidesMany =
    several && props.view === 'sides' && features !== undefined && props.onChangeEach !== undefined
  const shownEach = useMemo(
    () =>
      sidesMany && features !== undefined ? features.map((f) => splitBoth(f.tags)) : undefined,
    [sidesMany, features],
  )
  const manyLayout = useMemo(
    () => (shownEach === undefined ? undefined : sideLayout(combineTags(shownEach))),
    [shownEach],
  )
  const combinedRows = manyLayout?.plain ?? combined
  const groups = layout?.groups ?? manyLayout?.groups
  // the view is part of the model's identity: a switch starts the rows over, sorted
  const modelKey = `${featureKey}|${sides || sidesMany ? 'sides' : 'exact'}`
  const [model, setModel] = useState<TagModel>(() =>
    combinedRows !== undefined
      ? initialCombinedModel(modelKey, combinedRows, readOnlyKeys)
      : initialTagModel(modelKey, tags, readOnlyKeys),
  )
  const [note, setNote] = useState<{ text: string }>()
  // The host gave another feature, or other tags: the rows follow (the same state rule as useState's
  // "storing information from previous renders").
  let current = model
  const seen: object = combinedRows ?? tags
  if (model.featureKey !== modelKey) {
    current =
      combinedRows !== undefined
        ? initialCombinedModel(modelKey, combinedRows, readOnlyKeys)
        : initialTagModel(modelKey, tags, readOnlyKeys)
    setModel(current)
  } else if (model.seen !== seen) {
    current =
      combinedRows !== undefined
        ? syncCombinedModel(model, combinedRows, readOnlyKeys)
        : syncTagModel(model, tags, readOnlyKeys)
    setModel(current)
  }

  const onSheetChange = readOnly
    ? undefined
    : (batch: SheetBatch) => {
        if (sidesMany) {
          onSidesChangeMany(batch)
          return
        }
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
        if (sides) {
          onSidesChange(batch)
          return
        }
        const change = changeTagModel(current, tags, batch, readOnlyKeys)
        setModel(change.model)
        const refusal = change.refused[0]
        if (refusal !== undefined) setNote({ text: refusal.reason })
        if (change.label !== undefined) props.onChangeTags?.(change.tags, change.label)
      }

  /** A batch of the sides view, split: the changes of the rows with no side, and those of the group rows */
  function splitBatch(batch: SheetBatch): { plain?: SheetBatch; side?: SheetBatch } {
    const plain = batch.changes.filter((change) => !isSideRow(change.row))
    const side = batch.changes.filter((change) => isSideRow(change.row))
    return {
      ...(plain.length > 0 ? { plain: { ...batch, changes: plain } } : {}),
      ...(side.length > 0 ? { side: { ...batch, changes: side } } : {}),
    }
  }

  /**
   * A batch of the sides view: the changes of the rows with no side go through the model as always, those of the group
   * rows change their sides (applySideBatch). A key with a side entered on top wins over the group rows
   * (shownAfterPlain). The shown tags after both are written with equal sides as :both again. When nothing is written,
   * the rows on top follow the tags again, so a key with a side typed there leaves no row of its own behind.
   */
  function onSidesChange(batch: SheetBatch): void {
    const { plain, side } = splitBatch(batch)
    let next: Tags = shown
    let model: TagModel | undefined
    if (plain !== undefined) {
      const change = changeTagModel(current, tags, plain, readOnlyKeys)
      model = change.model
      const refusal = change.refused[0]
      if (refusal !== undefined) setNote({ text: refusal.reason })
      next = shownAfterPlain(shown, tags, change.tags)
    }
    if (side !== undefined) {
      const rows = layout?.groups.flatMap((group) => group.rows) ?? []
      const result = applySideBatch(next, rows, side, readOnlyKeys)
      const refusal = result.refused[0]
      if (refusal !== undefined) setNote({ text: refusal })
      next = result.tags
    }
    const label = tagChangeLabel(shown, next)
    const merged = label === undefined ? stored : mergeSides(next, shown, stored)
    // a change that ends where it began writes nothing
    const writes = label !== undefined && !sameTags(merged, stored)
    if (model !== undefined) setModel(writes ? model : syncTagModel(model, tags, readOnlyKeys))
    if (writes) props.onChangeTags?.(merged, label)
  }

  /**
   * A batch of the sides view for several features: the changes of the rows with no side go through the combined model
   * as always, those of the group rows become steps (sideSteps). Each feature takes the steps on its own shown tags and
   * merges its own equal sides into :both; the features that change are written as one step.
   */
  function onSidesChangeMany(batch: SheetBatch): void {
    if (features === undefined || shownEach === undefined || manyLayout === undefined) return
    const { plain, side } = splitBatch(batch)
    const steps: TagStep[] = []
    let model: TagModel | undefined
    if (plain !== undefined) {
      const change = changeCombinedModel(current, plain, readOnlyKeys)
      model = change.model
      const refusal = change.refused[0]
      if (refusal !== undefined) setNote({ text: refusal.reason })
      // a :both key entered on top is set as its two sides (shownAfterPlain, for one feature)
      if (change.change !== undefined) steps.push(...splitBothSteps(stepsOfChange(change.change)))
    }
    if (side !== undefined) {
      const rows = manyLayout.groups.flatMap((group) => group.rows)
      const taken = (key: string) => shownEach.some((each) => each[key] !== undefined)
      const result = sideSteps(rows, side, taken, readOnlyKeys)
      const refusal = result.refused[0]
      if (refusal !== undefined) setNote({ text: refusal })
      steps.push(...result.steps)
    }
    const changed = features.flatMap((feature, index) => {
      const before = shownEach[index] ?? feature.tags
      const next = mergeSides(applySteps(before, steps), before, feature.tags)
      return sameTags(next, feature.tags) ? [] : [{ id: feature.id, tags: next }]
    })
    const first = changed[0]
    const before = features.find((feature) => feature.id === first?.id)
    const writes = first !== undefined && before !== undefined
    if (model !== undefined && combinedRows !== undefined) {
      setModel(writes ? model : syncCombinedModel(model, combinedRows, readOnlyKeys))
    }
    if (writes) {
      props.onChangeEach?.(changed, tagChangeLabel(before.tags, first.tags) ?? m.ui_tags_changed())
    }
  }

  // the sides view: a group's name is cut short in its keys only when they would wrap at this width
  const root = useRef<HTMLDivElement>(null)
  const shortGroups = useShortGroups(root, groups ?? NO_GROUPS)

  // the sides view: the rows with no side (their value cell spans the right column), then the groups' rows
  const plainRows = useMemo(
    () =>
      groups === undefined
        ? current.rows.rows
        : current.rows.rows.map((row) => ({ ...row, merged: VALUE_SPANS })),
    [groups, current.rows.rows],
  )
  const sideRows = useMemo(
    () => (groups === undefined ? [] : groupSheetRows(groups, readOnlyKeys)),
    [groups, readOnlyKeys],
  )
  const rows = sideRows.length === 0 ? plainRows : [...plainRows, ...sideRows]

  // The columns are made again when the rows change: the key column leaves out the keys the other rows have, and
  // a mixed value cell offers the values its features have.
  const baseColumns = groups === undefined ? TAG_COLUMNS : sidesColumns(TAG_COLUMNS, shortGroups)
  const columns =
    several || suggest !== undefined ? withTagSuggestions(baseColumns, suggest, rows) : baseColumns

  const clipboard: SheetClipboard = {
    serialize: groups === undefined ? serializeTagCells : serializeSides,
    plan: (input) =>
      planTagsPaste(input, {
        tags: combinedRows !== undefined ? oneValuesOf(combinedRows) : tags,
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
    const text = combined !== undefined ? copyAllCombinedText(combined) : copyAllText(stored)
    void navigator.clipboard.writeText(text).then(
      () => setNote({ text: m.ui_sheet_copied() }),
      () => setNote({ text: m.ui_sheet_copy_refused() }),
    )
  }

  return (
    <div ref={root} className="flex flex-col" onBlur={onLeave}>
      <Sheet
        // another feature is another sheet: the active cell, an open pending row and the message start over
        key={featureKey}
        label={label}
        columns={columns}
        rows={rows}
        onChange={onSheetChange}
        clipboard={clipboard}
        trailingRow={!readOnly}
        showHeader={false}
        describePaste={describePaste}
        orderToken={String(current.version)}
        onUndo={onUndo}
        onRedo={onRedo}
        note={note}
        headingBefore={groups === undefined ? undefined : groupHeadings(groups)}
        trailingBefore={sideRows[0]?.id}
        newRowMerged={groups === undefined ? undefined : VALUE_SPANS}
      />
      {props.copyButton === false ? null : (
        <div className="mt-1 flex justify-end">
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
