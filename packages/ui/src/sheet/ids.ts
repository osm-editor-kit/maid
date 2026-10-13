import type { RowId } from './types.ts'

/**
 * Ids for rows that are not minted by the sheet's trailing row: a paste's new rows. The sheet's own ids are `t<n>`
 * (reducer.ts) and tags/tags.ts mints `tag<n>`. These are `new-<n>`, so the three never meet.
 * One generator per sheet: its counter only goes up, so an id is never given twice.
 */
export function newRowIds(): () => RowId {
  let count = 0
  return () => {
    count += 1
    return `new-${count}`
  }
}
