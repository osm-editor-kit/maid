import { ROW_CURRENT } from '@osm-editor-kit/maid-ui'

/** A button of the level picker and of the "Set level" menu: a map button's size, the levels in tight tabular digits */
export const BUTTON =
  'flex h-9 min-w-9 items-center justify-center px-2 text-sm font-medium tabular-nums tracking-tight text-zinc-950 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 pointer-coarse:h-10 pointer-coarse:min-w-10 dark:text-white'

/** BUTTON, with the current look when `pressed` (the edited level) */
export function buttonClass(pressed: boolean): string {
  return `${BUTTON} ${pressed ? ROW_CURRENT : 'bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'}`
}
