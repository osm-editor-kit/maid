/**
 * The olive of private task lists (module-tasks), Tailwind's `olive` palette (Tobias, 2026-11-11: "olive, mist, gray"):
 * the entry that loads a list in the account menu, its tab in the dock (`DockView.tone`), and the task block at the top
 * of the inspector (`InspectorSection.tone`). Amber stays the changes and TILDA, emerald "done", violet relations and
 * blue the selection, so the olive always says "this comes from your task list".
 */

/** The task block in the inspector: a tinted box that sets it apart from the fields under it */
export const TASKS_SURFACE =
  'rounded-lg border-l-4 border-olive-500 bg-olive-100 px-3 pt-2 pb-3 ring-1 ring-olive-600/25 dark:border-olive-400 dark:bg-olive-800/70 dark:ring-olive-400/30'

/** The heading of the task block and the icon beside the menu entry */
export const TASKS_TEXT = 'text-olive-700 dark:text-olive-200'

/** A dock tab of a task list, not selected */
export const TASKS_TAB =
  'bg-olive-200 text-olive-900 hover:bg-olive-300 hover:text-olive-950 dark:bg-olive-800 dark:text-olive-100 dark:hover:bg-olive-700 dark:hover:text-white'

/** A dock tab of a task list, selected */
export const TASKS_TAB_SELECTED = 'bg-olive-600 text-white dark:bg-olive-500 dark:text-white'

/** The menu entry that loads a list: tinted, so it stands apart from the settings around it */
export const TASKS_MENU_ITEM =
  'bg-olive-100 hover:bg-olive-200 dark:bg-olive-800/70 dark:hover:bg-olive-800'
