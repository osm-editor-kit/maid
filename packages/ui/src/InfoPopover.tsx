import { ArrowTopRightOnSquareIcon, InformationCircleIcon } from '@heroicons/react/16/solid'
import type { Field } from '@osm-editor-kit/maid-presets'
import { useEffect, useState } from 'react'
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
}

/**
 * Finds the documentation of a reference. It is asked only when the popover opens. `undefined` means
 * nothing was found; a rejection means the answer could not be had. The popover shows the same for both.
 */
export type ReferenceLoader = (reference: Reference) => Promise<ReferenceInfo | undefined>

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

/**
 * A small round "i" button that opens a compact panel next to it with what the OSM Wiki says about a
 * tag: its title, a description, an optional image and a link to the wiki page. It is a Flyout, so
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
}) {
  const { label, reference, load, buttonClassName, placement = 'right-start' } = props
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
      <ReferenceBody reference={reference} load={load} />
    </Flyout>
  )
}

type Found =
  | { status: 'loading' }
  | { status: 'done'; info: ReferenceInfo | undefined }
  | { status: 'failed' }

/** The panel's content. Mounted when the popover opens, so `load` runs on an opening and on nothing else. */
function ReferenceBody(props: { reference: Reference; load?: ReferenceLoader }) {
  const { reference, load } = props
  const [found, setFound] = useState<Found>(() =>
    load ? { status: 'loading' } : { status: 'done', info: undefined },
  )
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    if (!load) return
    // a late answer, for a popover that has closed or moved on, is dropped
    let current = true
    load(reference).then(
      (info) => {
        if (current) setFound({ status: 'done', info })
      },
      () => {
        if (current) setFound({ status: 'failed' })
      },
    )
    return () => {
      current = false
    }
  }, [reference, load])

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
      {info?.imageUrl && !imageFailed ? (
        <img
          src={info.imageUrl}
          alt={tag}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="max-h-40 w-full rounded-md bg-zinc-950/5 object-contain dark:bg-white/10"
        />
      ) : null}
      {info?.description ? (
        <p className="leading-5 text-zinc-700 dark:text-zinc-300">{info.description}</p>
      ) : null}
      <a
        href={wikiUrl(title)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400"
      >
        <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-4" />
        Open on the OSM Wiki
      </a>
    </div>
  )
}
