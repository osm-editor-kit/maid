/**
 * The olive of private task lists (module-tasks), Tailwind's `olive` palette (Tobias, 2026-11-11: "olive, mist, gray"):
 * the entry that loads a list in the account menu, its tab and its view in the dock (`DockView.tone`), and an open task
 * at the top of the inspector (module-tasks draws its own headings there). Amber stays the changes and TILDA, emerald
 * "done", violet relations and blue the selection, so the olive always says "this comes from your task list".
 *
 * Olive's light and dark steps are nearly grey, so the surfaces mix its mid step (500) into white or the dark
 * background: that keeps the hue visible (Tobias, 2026-11-11: "prominenter"). Opaque, as a sticky heading needs.
 */

/** The olive background of everything that belongs to a task list: an open task, the dock view, the menu entry */
export const TASKS_SURFACE =
  'bg-[color-mix(in_srgb,var(--color-olive-500)_16%,white)] dark:bg-[color-mix(in_srgb,var(--color-olive-500)_24%,var(--color-zinc-900))]'

/** The olive line at the left edge of a task-list surface */
export const TASKS_EDGE = 'border-l-4 border-olive-500 dark:border-olive-400'

/** An open task in the inspector: heading and group on the olive, out to the sidebar's edges */
export const TASKS_OPEN_HEADING = `-mx-3 pl-2 pr-3 ${TASKS_SURFACE} ${TASKS_EDGE}`
export const TASKS_OPEN_PANEL = `-mx-3 pl-2 pr-3 ${TASKS_SURFACE} ${TASKS_EDGE}`

/** The description of a task: text from the file, set apart as a quote */
export const TASKS_QUOTE =
  'rounded-r-lg border-l-4 border-olive-500 bg-white/70 px-3 py-2 dark:border-olive-400 dark:bg-zinc-950/40'

/** A card on the olive (an action of a task) */
export const TASKS_CARD = 'bg-white/80 dark:bg-zinc-900/70'

/** The status buttons that close a task: a bar at the end of its group, set apart from the olive around it */
export const TASKS_FOOTER =
  'rounded-lg bg-olive-600/15 p-2 ring-1 ring-olive-600/40 dark:bg-olive-400/15 dark:ring-olive-400/40'

/** The task icon in the inspector's heading and beside the menu entry */
export const TASKS_TEXT = 'text-olive-700 dark:text-olive-300'

/** A dock tab of a task list, not selected */
export const TASKS_TAB = `${TASKS_SURFACE} text-olive-900 hover:bg-olive-300 hover:text-olive-950 dark:text-olive-100 dark:hover:bg-olive-700 dark:hover:text-white`

/** A dock tab of a task list, selected */
export const TASKS_TAB_SELECTED = 'bg-olive-600 text-white dark:bg-olive-500 dark:text-white'

/** The menu entry that loads a list */
export const TASKS_MENU_ITEM = `${TASKS_SURFACE} ${TASKS_EDGE} hover:bg-olive-200 dark:hover:bg-olive-800`
