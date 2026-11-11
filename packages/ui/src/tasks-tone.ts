/**
 * The olive of private task lists (module-tasks), Tailwind's `olive` palette (Tobias, 2026-11-11: "olive, mist, gray"):
 * the entry that loads a list in the account menu, its tab in the dock (`DockView.tone`), and the task at the top
 * of the inspector (module-tasks draws its own headings there). Amber stays the changes and TILDA, emerald "done", violet relations and
 * blue the selection, so the olive always says "this comes from your task list".
 */

/** The description of a task: text from the file, set apart as a quote */
export const TASKS_QUOTE =
  'rounded-r-lg border-l-4 border-olive-400 bg-olive-50 px-3 py-2 dark:border-olive-500 dark:bg-olive-900/50'

/** The status buttons that close a task: a quiet bar at the end of its group */
export const TASKS_FOOTER =
  'rounded-lg bg-olive-100 p-2 ring-1 ring-olive-600/20 dark:bg-olive-800/60 dark:ring-olive-400/20'

/** The task icon in the inspector's heading and beside the menu entry */
export const TASKS_TEXT = 'text-olive-700 dark:text-olive-200'

/** A dock tab of a task list, not selected */
export const TASKS_TAB =
  'bg-olive-200 text-olive-900 hover:bg-olive-300 hover:text-olive-950 dark:bg-olive-800 dark:text-olive-100 dark:hover:bg-olive-700 dark:hover:text-white'

/** A dock tab of a task list, selected */
export const TASKS_TAB_SELECTED = 'bg-olive-600 text-white dark:bg-olive-500 dark:text-white'

/** The menu entry that loads a list: tinted, so it stands apart from the settings around it */
export const TASKS_MENU_ITEM =
  'bg-olive-100 hover:bg-olive-200 dark:bg-olive-800/70 dark:hover:bg-olive-800'
