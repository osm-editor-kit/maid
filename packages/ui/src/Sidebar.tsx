import { ArrowsRightLeftIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/20/solid'
import type { ReactNode } from 'react'
import { Flyout } from './Flyout.tsx'
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
  /**
   * What the title button opens, shown in a flyout that points at the button. `expanded` says
   * whether it is open and `onTitleClick` toggles it.
   */
  titleFlyout?: ReactNode
  /** A control beside the title, before the close button, for example the feature type's "i". Not part of the title button. */
  info?: ReactNode
}) {
  const { icon, title, subtitle, onClose, onTitleClick, expanded, titleAction, titleFlyout, info } =
    props
  const content = (
    <>
      {icon ? (
        <span
          aria-hidden="true"
          className={
            titleFlyout !== undefined
              ? // part of the header's box: full height, flush with its left edge, not a button of its own
                'inline-flex w-14 shrink-0 items-center justify-center self-stretch bg-zinc-950/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300 [&>svg]:size-7'
              : 'inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-950/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300 [&>svg]:size-6'
          }
        >
          {icon}
        </span>
      ) : null}
      <span className={`min-w-0 flex-1 text-left ${titleFlyout !== undefined ? 'py-3' : ''}`}>
        <span className="block truncate font-semibold">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  )
  // With a flyout the button is the header itself, edge to edge, and says "change" with a swap
  // icon; a chevron would promise a list that drops down below it.
  const titleButton = (onClick: (() => void) | undefined) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      title={titleAction}
      className={
        titleFlyout !== undefined
          ? `group flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 ${info ? 'pr-1' : 'pr-3'} hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 aria-expanded:bg-zinc-950/5 dark:hover:bg-white/5 dark:aria-expanded:bg-white/5`
          : 'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1 inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 dark:hover:bg-white/5'
      }
    >
      {content}
      {titleFlyout !== undefined ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 inset-ring-1 inset-ring-zinc-950/10 group-hover:text-zinc-950 dark:text-zinc-400 dark:inset-ring-white/10 dark:group-hover:text-white">
          <ArrowsRightLeftIcon aria-hidden="true" className="size-4" />
        </span>
      ) : (
        <ChevronDownIcon
          aria-hidden="true"
          className={`mr-1 size-4 shrink-0 text-zinc-500 transition dark:text-zinc-400 ${expanded ? 'rotate-180' : ''}`}
        />
      )}
    </button>
  )
  return (
    <div
      className={`group/header flex shrink-0 items-center gap-1 border-b border-zinc-950/10 dark:border-white/10 ${
        onTitleClick && titleFlyout !== undefined ? '' : 'p-2'
      }`}
    >
      {onTitleClick && titleFlyout !== undefined ? (
        <Flyout
          label={titleAction ?? title}
          placement="right-start"
          className="w-[26rem]"
          focus={false}
          open={expanded ?? false}
          onOpenChange={(open) => {
            if (open !== (expanded ?? false)) onTitleClick()
          }}
          trigger={titleButton(undefined)}
        >
          {titleFlyout}
        </Flyout>
      ) : onTitleClick ? (
        titleButton(onTitleClick)
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
          {/* a heading when the row is only a title */}
          <h2 className="contents">{content}</h2>
        </div>
      )}
      {/* fades in with the pointer over the header, like the buttons of a field row */}
      {info ? (
        <span className="flex shrink-0 items-center pr-3 opacity-0 transition-opacity duration-150 group-focus-within/header:opacity-100 group-hover/header:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
          {info}
        </span>
      ) : null}
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

/**
 * A group that folds away: its headline is the switch. Closed unless `defaultOpen`. `detail` is a
 * quiet word after the headline, such as a count or an id, which stays readable while folded.
 */
export function SidebarDisclosure(props: {
  title: string
  detail?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={props.defaultOpen}
      className="group/section border-t border-zinc-950/10 py-2.5 first:border-t-0 first:pt-0 dark:border-white/10"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-semibold text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-white [&::-webkit-details-marker]:hidden">
        <h3>{props.title}</h3>
        {props.detail !== undefined && props.detail !== '' ? (
          <span className="min-w-0 truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {props.detail}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-zinc-500 transition group-open/section:rotate-180 dark:text-zinc-400"
        />
      </summary>
      <div className="mt-2.5">{props.children}</div>
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
