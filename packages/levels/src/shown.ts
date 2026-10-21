/**
 * What the level mode does with a level while another one is edited (Tobias, 2026-10-21): the edited level is
 * editable, the levels up to NEIGHBOUR_RANGE above and below it stay in view but locked (on level 4: 3, 3.5 and 5),
 * the others are hidden. The renderer's layers (LEVEL_DIM) and the level picker follow the same rule.
 */
export const NEIGHBOUR_RANGE = 1

export type LevelState = 'edited' | 'shown' | 'hidden'

/** What the level mode edits: a level, or the features without a level (`'none'`, to find and fix them) */
export type EditedLevel = number | 'none'

/** The state of `level` while `edited` is the level being edited */
export function levelState(level: number, edited: number): LevelState {
  if (level === edited) return 'edited'
  return Math.abs(level - edited) <= NEIGHBOUR_RANGE ? 'shown' : 'hidden'
}
