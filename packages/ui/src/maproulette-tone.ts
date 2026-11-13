/**
 * The teal of MapRoulette (module-maproulette): its button in the top bar, its tab and view in the dock, an open task at
 * the top of the inspector, its block in the save form. Built like the olive of the private task lists (tasks-tone.ts),
 * so both read as "work from a list", and told apart by the hue: teal is close to the green of MapRoulette's own
 * interface without being Maid's emerald "done" (Tobias, 2026-11-13: Maid's design first, near MapRoulette's new UI).
 *
 * The surfaces mix teal's mid step (500) into white or the dark background, opaque, without borders, as the olive does.
 */

/** The teal background of everything that belongs to MapRoulette: an open task, the dock view, the save form's block */
export const MAPROULETTE_SURFACE =
  'bg-[color-mix(in_srgb,var(--color-teal-500)_14%,white)] dark:bg-[color-mix(in_srgb,var(--color-teal-500)_22%,var(--color-zinc-900))]'

/** An open task in the inspector: heading and group on the teal, out to the sidebar's edges */
export const MAPROULETTE_OPEN_HEADING = `-mx-3 px-3 ${MAPROULETTE_SURFACE}`
export const MAPROULETTE_OPEN_PANEL = `-mx-3 px-3 ${MAPROULETTE_SURFACE}`

/** Text from MapRoulette (the instructions), set apart as a quote */
export const MAPROULETTE_QUOTE = 'rounded-lg bg-white/70 px-3 py-2 dark:bg-zinc-950/40'

/** A card on the teal (the tag fix, a row of the list) */
export const MAPROULETTE_CARD = 'bg-white/80 dark:bg-zinc-900/70'

/** The status buttons that finish a task: a bar at the end of its group */
export const MAPROULETTE_FOOTER = 'rounded-lg bg-teal-600/15 p-2 dark:bg-teal-400/20'

/** The MapRoulette icon in a heading and beside an entry */
export const MAPROULETTE_TEXT = 'text-teal-700 dark:text-teal-300'

/** A dock tab of MapRoulette, not selected */
export const MAPROULETTE_TAB = `${MAPROULETTE_SURFACE} text-teal-900 hover:bg-teal-200 hover:text-teal-950 dark:text-teal-100 dark:hover:bg-teal-800 dark:hover:text-white`

/** A dock tab of MapRoulette, selected */
export const MAPROULETTE_TAB_SELECTED = 'bg-teal-600 text-white dark:bg-teal-500 dark:text-white'

/** The top bar button while a challenge is open: the icon and the challenge's short name on the teal */
export const MAPROULETTE_TOPBAR = `${MAPROULETTE_SURFACE} text-teal-900 dark:text-teal-100`

/** The main action of MapRoulette (Open, Next task) */
export const MAPROULETTE_BUTTON =
  'cursor-pointer rounded-md bg-teal-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-default disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400'

/** A quieter action on the teal */
export const MAPROULETTE_BUTTON_SECONDARY =
  'cursor-pointer rounded-md bg-white/80 px-2.5 py-1.5 text-sm font-medium text-teal-900 ring-1 ring-teal-700/20 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-default disabled:opacity-50 dark:bg-zinc-900/70 dark:text-teal-100 dark:ring-teal-300/20 dark:hover:bg-zinc-900'
