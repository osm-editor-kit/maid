/**
 * The state of the Tags sheet beside the grid, as functions of it: the rows of a feature, and what each event does to
 * the order and the incomplete rows (nextOrder, decisions 1 and 2 of 2026-10-13). No React.
 */
import type { Tags } from '@osm-editor-kit/maid-presets'
import type { SheetBatch } from '../types.ts'
import {
  applyBatch,
  NO_TAG_ROWS,
  nextOrder,
  orderRows,
  rowsFromTags,
  rowValue,
  type OrderMode,
  type ReadOnlyKeys,
  type Refusal,
  type TagRows,
} from './tags.ts'

export type TagModel = {
  featureKey: string
  /** The tags the rows were made from, by identity: a new object from the host means the tags changed. */
  seen: object
  rows: TagRows
  order: OrderMode
  keepIncomplete: boolean
  /** Counts the re-sorts. The sheet animates a re-sort, and nothing else (`orderToken`). */
  version: number
}

/** A feature was selected: sorted, and no incomplete rows. */
export function initialTagModel(
  featureKey: string,
  tags: Tags,
  readOnlyKeys?: ReadOnlyKeys,
): TagModel {
  const select = nextOrder('select')
  return {
    featureKey,
    seen: tags,
    rows: rowsFromTags(tags, NO_TAG_ROWS, {
      readOnlyKeys,
      order: select.order,
      keepIncomplete: select.keepIncomplete,
    }),
    order: select.order,
    keepIncomplete: select.keepIncomplete,
    version: 0,
  }
}

/** The host changed the tags: the rows follow them, in the order the model has (no re-sort). */
export function syncTagModel(model: TagModel, tags: Tags, readOnlyKeys?: ReadOnlyKeys): TagModel {
  return {
    ...model,
    seen: tags,
    rows: rowsFromTags(tags, model.rows, {
      readOnlyKeys,
      order: model.order,
      keepIncomplete: model.keepIncomplete,
    }),
  }
}

export type TagChange = {
  model: TagModel
  tags: Tags
  /** The undo label. Undefined when no tag changed: no call to the host. */
  label: string | undefined
  refused: Refusal[]
}

/**
 * One batch of the grid. A paste sorts at once; an edit holds the order and keeps incomplete rows. The tags are the
 * next tags; the host gets them once, with the label.
 */
export function changeTagModel(
  model: TagModel,
  tags: Tags,
  batch: SheetBatch,
  readOnlyKeys?: ReadOnlyKeys,
): TagChange {
  const event = batch.cause === 'paste' ? 'paste' : 'edit'
  const result = applyBatch(tags, model.rows, batch, { readOnlyKeys })
  const next = nextOrder(event)
  const sorted = next.order === 'sorted'
  return {
    model: {
      ...model,
      rows: sorted ? orderRows(result.rows, 'sorted') : result.rows,
      order: next.order,
      keepIncomplete: next.keepIncomplete,
      version: sorted ? model.version + 1 : model.version,
    },
    tags: result.tags,
    label: result.label,
    refused: result.refused,
  }
}

/** Focus left the sheet: sorted, and the incomplete rows (a key without a value) go. */
export function settleTagModel(model: TagModel): TagModel {
  const kept = orderRows(
    {
      rows: model.rows.rows.filter((row) => rowValue(row) !== ''),
      nextId: model.rows.nextId,
    },
    'sorted',
  )
  const same =
    kept.rows.length === model.rows.rows.length &&
    kept.rows.every((row, index) => row === model.rows.rows[index])
  const select = nextOrder('blur')
  return {
    ...model,
    rows: kept,
    order: select.order,
    keepIncomplete: select.keepIncomplete,
    version: same ? model.version : model.version + 1,
  }
}
