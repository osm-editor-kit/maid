import { ArrowTopRightOnSquareIcon, InformationCircleIcon } from '@heroicons/react/16/solid'
import type { Field } from '@osm-editor-kit/maid-presets'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { Flyout } from './Flyout.tsx'

/**
 * The OSM Wiki page of a tag: `key` alone or `key=value`, as the presets give it. Declared here from
 * the field type, because the presets index does not export the name.
 */
export type Reference = NonNullable<Field['reference']>

/** What a loader finds about a reference: iD's tag documentation, reduced to what the popover shows. */
export type ReferenceInfo = {
  description?: string
  /** An image for the tag, at a URL the browser can show */
  imageUrl?: string
  /** The wiki page to link, when it is not the page the reference names (for example a translation) */
  wikiTitle?: string
  /** The id of the tag's data item on the OSM Wiki (`Q123`), for the link to the item */
  itemId?: string
}

/**
 * Finds the documentation of a reference. It is asked only when the popover opens. `undefined` means
 * nothing was found; a rejection means the answer could not be had. The popover shows the same for both.
 * `signal` aborts when the popover closes: a loader stops asking then.
 */
export type ReferenceLoader = (
  reference: Reference,
  signal?: AbortSignal,
) => Promise<ReferenceInfo | undefined>

/** The tag as the popover titles it: `key=value`, or `key=*` for a key alone. */
export function referenceTag(reference: Reference) {
  return `${reference.key}=${reference.value ?? '*'}`
}

/** The wiki page of a reference, as iD names it: `Key:<key>` or `Tag:<key>=<value>`, with `_` read as a space. */
export function wikiTitleOf(reference: Reference) {
  const title =
    reference.value === undefined
      ? `Key:${reference.key}`
      : `Tag:${reference.key}=${reference.value}`
  return title.replaceAll('_', ' ').trim()
}

/** The URL of a wiki page: the title with its characters escaped, and the three that would end the path escaped too. */
export function wikiUrl(title: string) {
  return `https://wiki.openstreetmap.org/wiki/${encodeURI(title).replace(/[#?&]/g, (char) => encodeURIComponent(char))}`
}

const BUTTON =
  'grid size-5 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 aria-expanded:bg-zinc-950/5 aria-expanded:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white dark:aria-expanded:bg-white/10 dark:aria-expanded:text-white'

const LINK =
  'inline-flex w-fit items-center gap-1 rounded-md text-xs font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400'

/**
 * A small round "i" button that opens a compact panel next to it with what the OSM Wiki says about a
 * tag: its title, a description, links to the wiki page and to the tag's data item, and an image below them. It is a Flyout, so
 * a click outside or Escape closes it. Without `load` it shows the tag and the link only.
 */
export function InfoPopover(props: {
  /** The field or feature type the reference belongs to: names the button "About <label>" */
  label: string
  reference: Reference
  /** Finds the documentation. Called on each opening, the app caches the answers. */
  load?: ReferenceLoader
  /** Classes for the button, for example to show it only on hover */
  buttonClassName?: string
  /** Which side of the button the panel opens on. Right by default: the sidebar is at the left. */
  placement?: 'bottom-start' | 'bottom-end' | 'right-start' | 'left-start'
  /** A line about the field below the documentation, for example how to change its value on the map */
  hint?: string
}) {
  const { label, reference, load, buttonClassName, placement = 'right-start', hint } = props
  const tag = referenceTag(reference)
  return (
    <Flyout
      label={`Documentation of ${tag}`}
      placement={placement}
      className="w-80"
      // the button keeps the keyboard focus; the panel is read, and its link is one Tab away
      focus={false}
      trigger={
        <button
          type="button"
          aria-label={`About ${label}`}
          title={`About ${label}`}
          className={twMerge(BUTTON, buttonClassName)}
        >
          <InformationCircleIcon aria-hidden="true" className="size-4" />
        </button>
      }
    >
      <ReferenceBody reference={reference} load={load} hint={hint} />
    </Flyout>
  )
}

type Found =
  | { status: 'loading' }
  | { status: 'done'; info: ReferenceInfo | undefined }
  | { status: 'failed' }

/**
 * The panel's content. It mounts when the popover opens, so the query runs on an opening and on nothing else.
 * Closing the popover unobserves the query. TanStack then aborts the loader's signal, so no wiki call is left
 * running. The loader retries its own calls (packages/shell/src/components/reference.ts: one request per try, for
 * both pages), so the query does not retry.
 */
function ReferenceBody(props: { reference: Reference; load?: ReferenceLoader; hint?: string }) {
  const { reference, load, hint } = props
  const lookup = useQuery({
    queryKey: ['reference', reference.key, reference.value ?? null] as const,
    queryFn: async ({ signal }) => (await load?.(reference, signal)) ?? null,
    enabled: load !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const found: Found = !load
    ? { status: 'done', info: undefined }
    : lookup.isError
      ? { status: 'failed' }
      : lookup.data === undefined
        ? { status: 'loading' }
        : { status: 'done', info: lookup.data ?? undefined }
  const [imageFailed, setImageFailed] = useState(false)

  const info = found.status === 'done' ? found.info : undefined
  const tag = referenceTag(reference)
  const title = info?.wikiTitle ?? wikiTitleOf(reference)
  return (
    <div className="grid gap-3 p-3">
      <code className="font-mono text-sm font-semibold break-all text-zinc-950 dark:text-white">
        {tag}
      </code>
      {found.status === 'loading' ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading the description…</p>
      ) : null}
      {info?.description ? (
        <p className="leading-5 text-zinc-700 dark:text-zinc-300">{info.description}</p>
      ) : null}
      {/* the icon and the colour say "opens elsewhere": the text only names the place */}
      <div className="grid grid-cols-2 gap-2">
        <a href={wikiUrl(title)} target="_blank" rel="noopener noreferrer" className={LINK}>
          <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5 shrink-0" />
          OSM Wiki
        </a>
        {info?.itemId ? (
          <a
            href={wikiUrl(`Item:${info.itemId}`)}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5 shrink-0" />
            Data item
          </a>
        ) : null}
      </div>
      {hint ? (
        <p className="border-t border-zinc-950/10 pt-3 text-xs leading-5 text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
      {/* last: the image arrives after the text, so it grows the panel downwards and nothing above it moves */}
      {info?.imageUrl && !imageFailed ? (
        <img
          src={info.imageUrl}
          alt={tag}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="max-h-40 w-full rounded-md bg-zinc-950/5 object-contain dark:bg-white/10"
        />
      ) : null}
    </div>
  )
}
