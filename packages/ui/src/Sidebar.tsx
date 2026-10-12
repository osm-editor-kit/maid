import { XMarkIcon } from '@heroicons/react/20/solid'
import type { ReactNode } from 'react'

/** Left column for the selection and its properties; a full-height landmark with a hairline on its right. */
export function Sidebar(props: { label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={props.label}
      className="flex h-full min-h-0 w-full flex-col border-r border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900"
    >
      {props.children}
    </aside>
  )
}

/** Title row at the top of a sidebar, with an optional close button. */
export function SidebarHeader(props: {
  icon?: ReactNode
  title: string
  subtitle?: string
  onClose?: () => void
}) {
  const { icon, title, subtitle, onClose } = props
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-zinc-950/10 px-3 py-2.5 dark:border-white/10">
      {icon ? (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex shrink-0 text-zinc-500 dark:text-zinc-400 [&>svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">{title}</h2>
        {subtitle ? (
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-my-1.5 -mr-2 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white"
        >
          <XMarkIcon aria-hidden="true" className="size-5" />
        </button>
      ) : null}
    </div>
  )
}

/** Scrolling area under the sidebar header. */
export function SidebarBody(props: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-3">{props.children}</div>
}

/** A titled group inside the sidebar body, separated from the group above by a hairline. */
export function SidebarSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-950/10 py-3 first:border-t-0 first:pt-0 dark:border-white/10">
      <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{props.title}</h3>
      {props.children}
    </section>
  )
}

/** Centred hint for a sidebar with nothing selected. */
export function SidebarEmpty(props: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="font-medium">{props.title}</p>
      {props.children ? (
        <div className="text-zinc-500 dark:text-zinc-400">{props.children}</div>
      ) : null}
    </div>
  )
}
