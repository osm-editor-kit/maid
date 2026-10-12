import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/20/solid'
import type { ReactNode } from 'react'
import { FadeSlideIn } from './motion.tsx'

/**
 * Left column for the selection and its properties; a full-height landmark with a hairline on its
 * right. Its content eases in when the sidebar shows something else (its label changes), not on
 * every re-render.
 */
export function Sidebar(props: { label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={props.label}
      className="flex h-full min-h-0 w-full flex-col border-r border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900"
    >
      <FadeSlideIn key={props.label} x={-12} className="flex min-h-0 flex-1 flex-col">
        {props.children}
      </FadeSlideIn>
    </aside>
  )
}

/**
 * Title row at the top of a sidebar, with an optional close button. With `onTitleClick` the icon
 * and the title are one large button, as iD's feature type button is: it opens what changes
 * the type, and `expanded` says whether that is open.
 */
export function SidebarHeader(props: {
  icon?: ReactNode
  title: string
  subtitle?: string
  onClose?: () => void
  onTitleClick?: () => void
  expanded?: boolean
  /** What the title button does, for its tooltip and for screen readers */
  titleAction?: string
}) {
  const { icon, title, subtitle, onClose, onTitleClick, expanded, titleAction } = props
  const content = (
    <>
      {icon ? (
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-950/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300 [&>svg]:size-6"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  )
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-950/10 p-2 dark:border-white/10">
      {onTitleClick ? (
        <button
          type="button"
          onClick={onTitleClick}
          aria-expanded={expanded}
          title={titleAction}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1 inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 dark:hover:bg-white/5"
        >
          {content}
          <ChevronDownIcon
            aria-hidden="true"
            className={`mr-1 size-4 shrink-0 text-zinc-500 transition dark:text-zinc-400 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
          {/* a heading when the row is only a title */}
          <h2 className="contents">{content}</h2>
        </div>
      )}
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white"
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

/** A group like `SidebarSection` that folds away: its title is the switch. Closed unless `defaultOpen`. */
export function SidebarDisclosure(props: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={props.defaultOpen}
      className="group border-t border-zinc-950/10 py-3 first:border-t-0 first:pt-0 dark:border-white/10"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white [&::-webkit-details-marker]:hidden">
        {props.title}
        <ChevronDownIcon aria-hidden="true" className="size-4 transition group-open:rotate-180" />
      </summary>
      <div className="mt-2">{props.children}</div>
    </details>
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
