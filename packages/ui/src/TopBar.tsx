import type { ReactNode } from 'react'

/**
 * Top bar with start, centre and end areas; the centre stays centred whatever the sides hold. On a
 * phone the centre scrolls sideways instead of wrapping, so the bar never grows taller or wider.
 */
export function TopBar(props: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  return (
    <header className="grid h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-zinc-950/10 bg-white px-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex min-w-0 items-center gap-2">{props.start}</div>
      <div className="flex min-w-0 items-center justify-start gap-2 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] sm:justify-center sm:overflow-visible sm:py-0 [&::-webkit-scrollbar]:hidden">
        {props.center}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">{props.end}</div>
    </header>
  )
}

/** The app name, with an optional quieter detail after it (for example the scene or version). The detail is shown from `sm` up. */
export function Brand(props: { name: string; detail?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 font-semibold">{props.name}</span>
      {props.detail ? (
        <span className="hidden truncate text-zinc-500 sm:block dark:text-zinc-400">
          {props.detail}
        </span>
      ) : null}
    </div>
  )
}
