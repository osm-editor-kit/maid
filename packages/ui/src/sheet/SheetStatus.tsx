import { XMarkIcon } from '@heroicons/react/16/solid'
import type { PasteReport } from './types.ts'

/**
 * The line under the grid: what a paste or a copy did, the lines it refused (named, with the reason), and the length
 * counter of the active cell. A live region, so a screen reader hears each message once.
 */
export function SheetStatus(props: {
  message: string | undefined
  counter: string | undefined
  refused: PasteReport['refused']
  onClose?: () => void
}) {
  const { message, counter, refused, onClose } = props
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-1 flex min-h-4 items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400"
    >
      <div className="min-w-0 flex-1">
        {counter !== undefined ? (
          <p
            className={counter.includes('too long') ? 'text-red-600 dark:text-red-400' : undefined}
          >
            {counter}
          </p>
        ) : null}
        {message !== undefined ? <p>{message}</p> : null}
        {refused.length > 0 ? (
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {refused.map((entry, index) => (
              <li key={`${entry.line}-${index}`} className="truncate font-mono">
                {`Line ${entry.line}: ${entry.text}`}{' '}
                <span className="font-sans text-zinc-500 dark:text-zinc-400">({entry.reason})</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {onClose !== undefined && refused.length > 0 ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the message"
          className="grid size-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
