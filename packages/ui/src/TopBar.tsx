import type { ReactNode } from 'react'

/** Top bar with start, centre and end areas; the centre stays centred whatever the sides hold. */
export function TopBar(props: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-zinc-950/10 bg-white px-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex min-w-0 items-center gap-2">{props.start}</div>
      <div className="flex items-center gap-2">{props.center}</div>
      <div className="flex min-w-0 items-center justify-end gap-2">{props.end}</div>
    </header>
  )
}

/** The app name, with an optional quieter detail after it (for example the scene or version). */
export function Brand(props: { name: string; detail?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 font-semibold">{props.name}</span>
      {props.detail ? (
        <span className="truncate text-zinc-500 dark:text-zinc-400">{props.detail}</span>
      ) : null}
    </div>
  )
}
