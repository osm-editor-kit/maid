import { InformationCircleIcon } from '@heroicons/react/16/solid'
import { twJoin } from 'tailwind-merge'
import { Tooltip } from './Tooltip.tsx'

/**
 * A small round "i" that shows a text on hover and on focus: for a help text that would otherwise take a line of its
 * own under a title, or a hint at a row. `warn` colours it amber, for a hint to heed (a key in a shared link).
 */
export function InfoTip(props: { text: string; warn?: boolean }) {
  const { text, warn } = props
  return (
    <Tooltip label={text}>
      <button
        type="button"
        aria-label={text}
        className={twJoin(
          'grid size-6 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-blue-500',
          warn
            ? 'text-amber-600 hover:bg-amber-500/10 dark:text-amber-400'
            : 'text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white',
        )}
      >
        <InformationCircleIcon aria-hidden="true" className="size-4" />
      </button>
    </Tooltip>
  )
}
