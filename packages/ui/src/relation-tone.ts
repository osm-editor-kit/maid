/**
 * The violet of relation editing: the relation column beside the inspector (Shell's `sidebarStart`), the icon of the
 * inspector sections that edit relations (`InspectorSection.tone`, violet while open), and on the map the open
 * relation's glow and the related halo (renderer layers.ts). The feature itself keeps the neutral look and blue stays the
 * selection, so violet always says "a relation".
 */

/** A group heading in the relation column: its violet, opaque as it sticks, with the inspector's dark text */
export const RELATION_HEADING =
  'bg-violet-100 text-zinc-950 dark:bg-[color-mix(in_srgb,var(--color-violet-950)_50%,var(--color-zinc-900))] dark:text-white'

/** The icon before the title of an open relation section; folded it is the chevron's grey */
export const RELATION_ICON_OPEN = 'text-violet-600 dark:text-violet-400'

/**
 * A quiet box inside a relation section (the FROM roads and the junction of the turn restrictions); opaque, so that the
 * junction's arrow halos can take its colour
 */
export const RELATION_SURFACE =
  'border-violet-950/10 bg-violet-50 dark:border-white/10 dark:bg-[color-mix(in_srgb,var(--color-violet-950)_40%,var(--color-zinc-950))]'

/** The square behind a relation's icon in a list row */
export const RELATION_ICON =
  'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100'

/** The row of the relation that is open beside the inspector */
export const RELATION_OPEN_ROW = 'bg-violet-100 dark:bg-violet-950/50'

/** A chosen chip in a relation section (the FROM road of the turn restrictions) */
export const RELATION_CHOSEN = 'border-violet-600 bg-violet-600 text-white'
