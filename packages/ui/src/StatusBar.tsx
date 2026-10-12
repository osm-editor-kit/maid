import type { ReactNode } from 'react'
import { twJoin, twMerge } from 'tailwind-merge'

/** Bottom strip for small status readouts, with a hairline on top. */
export function StatusBar(props: { children: ReactNode }) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-t border-zinc-950/10 bg-white px-3 text-xs text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
      {props.children}
    </footer>
  )
}

/** One readout in the status bar; `warning` turns it amber. The app can pass `className`, for example `ml-auto`. */
export function StatusItem(props: {
  children: ReactNode
  tone?: 'default' | 'warning'
  className?: string
}) {
  return (
    <span
      className={twMerge(
        twJoin(
          'whitespace-nowrap tabular-nums',
          props.tone === 'warning' && 'text-amber-700 dark:text-amber-400',
        ),
        props.className,
      )}
    >
      {props.children}
    </span>
  )
}
