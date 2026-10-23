import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import {
  Flyout,
  notify,
  Time,
  type InspectorSection,
  type InspectorSectionProps,
} from '@osm-editor-kit/maid-ui'
import { handleJosmLinkClick, type OsmLink } from '@osm-editor-kit/osm-editor-links'
import { useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { usePresets, useShell } from '../shell-context'
import { changesetRowLinks, idLinks, placeOf, userRowLinks, websiteOf } from './element-links'

/**
 * The props of a link's anchor: a new tab, or for a JOSM link the remote control, which answers without a page.
 * `onFollow` runs when the link is taken (the list closes).
 */
function anchorProps(
  link: OsmLink,
  onFollow?: () => void,
): AnchorHTMLAttributes<HTMLAnchorElement> {
  if (link.josm)
    return {
      href: link.url,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        // cancelled here: handleJosmLinkClick cancels only after its fetch, which is too late to stop the navigation
        event.preventDefault()
        onFollow?.()
        handleJosmLinkClick(event.nativeEvent).catch(() =>
          notify.failed('JOSM does not answer. Is it running with remote control on?'),
        )
      },
    }
  return { href: link.url, target: '_blank', rel: 'noopener noreferrer', onClick: onFollow }
}

/**
 * A value that links to its first link, opened in a new tab, with a small button beside it that lists all the links
 * of the row. The button stays visible when the value is cut short.
 */
function LinkedValue({ value, links }: { value: string | number; links: readonly OsmLink[] }) {
  const [open, setOpen] = useState(false)
  const text = String(value)
  const [main] = links
  return (
    <span className="flex min-w-0 items-center gap-1">
      {main && (
        <a
          {...anchorProps(main)}
          title={text}
          className="min-w-0 truncate text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400"
        >
          {text}
        </a>
      )}
      <Flyout
        label={`Links for ${text}`}
        placement="bottom-end"
        className="w-64"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={`Links for ${text}`}
            title={`Links for ${text}`}
            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </button>
        }
      >
        <ul className="flex flex-col p-1">
          {links.map((link) => (
            <li key={link.id}>
              <a
                {...anchorProps(link, () => setOpen(false))}
                className="block rounded-lg px-2 py-1.5 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Flyout>
    </span>
  )
}

/** Version, changeset, user and timestamp of the selected entity, and whether it is edited. */
function ElementInfo({ entity, editor }: InspectorSectionProps) {
  const { config, engine } = useShell()
  const presets = usePresets()
  const current = editor.history.staging.graph.hasEntity(entity.id)
  const original = editor.history.base.graph.hasEntity(entity.id)
  const props = current?.props ?? {}
  // the links go to the website of the data (the development server, or openstreetmap.org). The ID's links that
  // need a country get the place of the feature and its country codes, as the inspector's address field finds them;
  // without them only the links offered everywhere are kept
  const website = websiteOf(config.source)
  const centre = engine.centreOf(entity.id)
  const countryCodes = centre && presets ? presets.countryCodesAt(centre) : []
  // the shown form may differ from the value: a time is a `<Time>`, whose tooltip gives the other form,
  // so such a row gets no native title (a title would show the raw ISO string on top of it)
  type Row = {
    label: string
    value: string | number | undefined
    shown?: ReactNode
    /** The row's links: the first is the value's own, all are listed beside it. Absent or none: a plain value */
    links?: readonly OsmLink[]
  }
  const size: Row[] =
    entity.type === 'way'
      ? [{ label: 'Nodes', value: entity.size }]
      : entity.type === 'relation'
        ? [{ label: 'Members', value: entity.size }]
        : []
  const rows: Row[] = [
    {
      label: 'ID',
      value: entity.id,
      links: idLinks(entity.id, { website, loc: placeOf(centre), countryCodes }),
    },
    ...size,
    { label: 'Version', value: props.version },
    {
      label: 'Changeset',
      value: props.changeset,
      links: changesetRowLinks(entity.id, props.changeset, website),
    },
    { label: 'User', value: props.user, links: userRowLinks(entity.id, props.user, website) },
    { label: 'Timestamp', value: props.timestamp, shown: <Time value={props.timestamp} /> },
  ]
  const edited = current !== original
  return (
    <dl className="font-mono text-xs">
      {rows.map(({ label, value, shown, links }) => {
        const linked = value !== undefined && links !== undefined && links.length > 0
        return (
          <div
            key={label}
            className="flex gap-2 border-b border-zinc-950/5 py-1 last:border-0 dark:border-white/5"
          >
            <dt className="w-2/5 shrink-0 truncate text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd
              className="min-w-0 flex-1 truncate"
              title={shown || linked ? undefined : String(value ?? '')}
            >
              {linked ? <LinkedValue value={value} links={links} /> : (shown ?? value ?? '—')}
            </dd>
          </div>
        )
      })}
      {edited && (
        <div className="flex gap-2 py-1">
          <dt className="w-2/5 shrink-0 text-zinc-500 dark:text-zinc-400">Status</dt>
          <dd className="min-w-0 flex-1 text-amber-700 dark:text-amber-400">
            edited, not uploaded
          </dd>
        </div>
      )}
    </dl>
  )
}

/** Adds an "Element" section to the inspector. */
export function elementInfo() {
  return defineModule({
    id: 'element-info',
    setup(api) {
      const section: InspectorSection = {
        id: 'element-info',
        title: 'Element',
        // id, version and so on are looked at now and then: folded away until asked for
        disclosure: 'closed',
        detail: (entity) => entity.id,
        component: ElementInfo,
      }
      api.register('inspector.section', section)
    },
  })
}
