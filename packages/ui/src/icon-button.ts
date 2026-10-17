/**
 * The look of the small icon buttons in the picker rows and the favourites panel. The colour is not here: a class
 * of the same property in the same string would be overridden by the order of the generated CSS, so each button adds
 * its own text colour (a favourite's star is amber).
 */
export const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg enabled:cursor-pointer enabled:hover:bg-zinc-950/5 enabled:hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:enabled:hover:bg-white/10 dark:enabled:hover:text-white'

export const ICON_TONE = 'text-zinc-500 dark:text-zinc-400'
