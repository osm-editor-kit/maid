import { PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { isAutomated } from '@osm-editor-kit/maid-core'
import { PLAIN_INPUT, Tooltip } from '@osm-editor-kit/maid-ui'
import { toolButtonTone } from '@osm-editor-kit/maid-ui'
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { checkTemplate, keyLikeNames, shortLabel, type CustomEntry } from './custom.ts'
import { listView, type Listed } from './eli.ts'
import { BRIGHTNESS_MIN, listingView, matchesQuery, sortListing } from './helpers.ts'
import {
  useBrightness,
  useCustomBackgrounds,
  useImageryActions,
  useImagerySelector,
  useView,
  type SaveResult,
} from './imagery-store.ts'
import { filterSeriesRows, seriesRows, type SeriesChip, type SeriesRow } from './series.ts'
import { useLiveImagery } from './shown.ts'
import { customValue, isCustomValue, NONE, templateOf } from './url.ts'

/** From this many layers in view on, a search field is shown above the list */
const SEARCH_FROM = 8

const MUTED = 'text-xs text-zinc-500 dark:text-zinc-400'
const FIELD =
  'w-full rounded-md bg-white px-2.5 text-sm inset-ring-1 inset-ring-zinc-950/10 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:inset-ring-white/10'
const BUTTON =
  'rounded-md px-2.5 py-1.5 text-sm inset-ring-1 inset-ring-zinc-950/10 enabled:hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 dark:enabled:hover:bg-zinc-700'
const PRIMARY_BUTTON =
  'rounded-md bg-blue-600 px-2.5 py-1.5 text-sm font-medium text-white enabled:hover:bg-blue-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-blue-500 dark:enabled:hover:bg-blue-400'
const TEXT_BUTTON =
  'text-xs font-medium text-blue-700 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:hover:text-blue-300'
const ICON_BUTTON =
  'flex size-7 items-center justify-center rounded-md text-zinc-500 enabled:hover:bg-zinc-200 enabled:hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:enabled:hover:bg-zinc-600 dark:enabled:hover:text-white'

/** The examples in the form's help. The host is made up: tiles.example.org is never fetched. */
const TOKEN_EXAMPLES = [
  { label: '{z}/{x}/{y} tiles', example: 'https://tiles.example.org/{z}/{x}/{y}.png' },
  {
    label: 'TMS: {-y} counts rows from the south',
    example: 'https://tiles.example.org/{z}/{x}/{-y}.png',
  },
  {
    label: 'WMS with a bounding box',
    example:
      'https://tiles.example.org/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=aerial&SRS={proj}&BBOX={bbox}&WIDTH={width}&HEIGHT={height}&FORMAT=image/png&TRANSPARENT=true',
  },
]
const MORE_TOKENS =
  'Also: {switch:a,b,c} for several hosts, {u} for quadkey tiles, {@2x} or {r} for retina tiles. Not supported: {w}, {s}, {n} and {e}, which MapLibre has no token for.'
const RIGHTS =
  'You are responsible for having the right to use this imagery. Check the provider’s terms.'

/** The classes that are set, joined with spaces */
function classes(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/**
 * The top bar's background panel: the imagery that covers the map's view, the overlays, and the
 * brightness of the background. Mounted only while the flyout is open, so the list is loaded when
 * a person opens it.
 */
export function ImageryPanel() {
  return (
    <div>
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-base font-semibold">Background</h2>
        <p className="text-zinc-500 dark:text-zinc-400">
          Imagery under the OSM data. Tiles come from the provider&apos;s server once you choose a
          layer.
        </p>
      </div>
      {isAutomated() ? (
        <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
          Backgrounds are off in automated browsers, except a template on this machine (a link with
          `background=custom:` to localhost).
        </p>
      ) : (
        <PanelBody />
      )}
    </div>
  )
}

/** The form of a custom background: a new one, or the entry being edited */
type FormState = { mode: 'add' } | { mode: 'edit'; entry: CustomEntry } | null

function PanelBody() {
  const view = useView()
  const brightness = useBrightness()
  const custom = useCustomBackgrounds()
  const defaultBackground = useImagerySelector((state) => state.defaultBackground)
  const { shown, chooseBackground, chooseOverlays, setUrlBackground } = useLiveImagery()
  const { setBrightness, addCustom, editCustom, deleteCustom } = useImageryActions()
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<FormState>(null)
  const [asking, setAsking] = useState<string | null>(null)
  // the layers that cover the view, keyed by the rounded view (listingView): a pan of a few pixels asks
  // nothing new. The last list stays while a new one is computed, so the panel does not flicker.
  const rounded = view === null ? null : listingView(view)
  const listing = useQuery({
    queryKey: ['imagery', 'listing', rounded?.bounds ?? null, rounded?.zoom ?? null],
    queryFn: rounded === null ? skipToken : (): Promise<Listed> => listView(rounded),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
  const failed = listing.isError
  const listed: Listed | null = listing.data ?? (failed ? { items: [], series: [] } : null)

  // the last list stays until the new one arrives, so the panel does not flicker while the map moves.
  // The layers are already filtered by the view and its zoom (see `listView`).
  const items = listed?.items ?? []
  // the background that is shown: the URL's, else the start order's (shown.ts)
  const shownId = shown.background
  const rows = filterSeriesRows(seriesRows(listed?.series ?? [], shownId), query)
  const overlays = sortListing(items).filter((item) => item.overlay && matchesQuery(item, query))
  const percent = Math.round(brightness * 100)
  const chosenOutOfView =
    shownId !== NONE &&
    !isCustomValue(shownId) &&
    listed !== null &&
    !items.some((item) => item.id === shownId)
  const shownTemplate = templateOf(shownId)
  const shownIsSaved = custom.some((entry) => customValue(entry.template) === shownId)
  // a form saved closes; a refused one keeps its reason in the form
  const save = (result: SaveResult) => {
    if (result.ok) setForm(null)
    return result
  }

  return (
    <>
      {items.length > SEARCH_FROM ? (
        <div className="px-4 pb-2">
          <input
            {...PLAIN_INPUT}
            type="search"
            aria-label="Search backgrounds"
            placeholder="Search backgrounds"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-md bg-white px-2.5 text-sm inset-ring-1 inset-ring-zinc-950/10 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:inset-ring-white/10"
          />
        </div>
      ) : null}

      {listed === null ? (
        <p className="px-4 pb-3 text-sm text-zinc-500 dark:text-zinc-400">Loading backgrounds…</p>
      ) : failed ? (
        <p className="px-4 pb-3 text-sm text-red-700 dark:text-red-400">
          The list of backgrounds could not be loaded.
        </p>
      ) : null}

      {listed !== null && !failed && items.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-zinc-500 dark:text-zinc-400">
          No background covers this view at this zoom.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
        <h3 className="text-sm font-medium">Backgrounds</h3>
        <button type="button" className={TEXT_BUTTON} onClick={() => setForm({ mode: 'add' })}>
          Add custom
        </button>
      </div>

      {form !== null ? (
        <CustomForm
          key={form.mode === 'edit' ? form.entry.template : 'add'}
          entry={form.mode === 'edit' ? form.entry : null}
          onSave={(name, template) => {
            if (form.mode === 'edit') {
              const result = editCustom(form.entry.template, name, template)
              // the shown background was this entry: the URL follows its new template
              if (result.ok && shownId === customValue(form.entry.template)) {
                void setUrlBackground(result.value)
              }
              return save(result)
            }
            const result = addCustom(name, template)
            if (result.ok) chooseBackground(result.value)
            return save(result)
          }}
          onCancel={() => setForm(null)}
        />
      ) : null}

      <div role="group" aria-label="Background" className="flex flex-col gap-1 px-2 pb-2">
        <Choice
          name="None"
          detail="No imagery under the map"
          selected={shownId === NONE}
          onSelect={() => chooseBackground(NONE)}
        />
        {isCustomValue(shownId) && !shownIsSaved ? (
          <Choice
            name={shortLabel(shownTemplate ?? '') || 'Custom'}
            detail="Not saved"
            selected
            onSelect={() => chooseBackground(shownId)}
          />
        ) : null}
        {custom.map((entry) => (
          <CustomRow
            key={entry.template}
            entry={entry}
            selected={shownId === customValue(entry.template)}
            asking={asking === entry.template}
            onSelect={() => chooseBackground(customValue(entry.template))}
            onEdit={() => setForm({ mode: 'edit', entry })}
            onAsk={() => setAsking(entry.template)}
            onCancelAsk={() => setAsking(null)}
            onDelete={() => {
              deleteCustom(entry.template)
              // the shown background was this entry: the default takes its place, in the URL
              if (shownId === customValue(entry.template))
                void setUrlBackground(defaultBackground ?? NONE)
              setAsking(null)
            }}
          />
        ))}
        {rows.map((row) => (
          <SeriesChoice key={row.key} row={row} onSelect={chooseBackground} />
        ))}
      </div>

      {shownTemplate !== null ? <TemplateHint template={shownTemplate} /> : null}

      {chosenOutOfView ? (
        <p className="px-4 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
          The chosen background does not cover this view at this zoom. It stays on the map.
        </p>
      ) : null}

      {overlays.length > 0 ? (
        <div className="border-t border-zinc-950/5 px-4 py-3 dark:border-white/5">
          <h3 className="pb-1 text-sm font-medium">Overlays</h3>
          <ul>
            {overlays.map((item) => (
              <li key={item.id} className="py-1">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    {...PLAIN_INPUT}
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-blue-600"
                    checked={shown.overlays.includes(item.id)}
                    onChange={(event) => {
                      const on = event.target.checked
                      chooseOverlays(
                        on
                          ? [...shown.overlays.filter((id) => id !== item.id), item.id]
                          : shown.overlays.filter((id) => id !== item.id),
                      )
                    }}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span>{item.name}</span>
                    {item.attributionText ? (
                      <span className={MUTED}>{item.attributionText}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shownId !== NONE ? (
        <label className="flex items-center gap-3 border-t border-zinc-950/5 px-4 py-3 text-sm dark:border-white/5">
          <span className="w-20 shrink-0">Brightness</span>
          <input
            {...PLAIN_INPUT}
            type="range"
            className="min-w-0 flex-1 accent-blue-600"
            min={Math.round(BRIGHTNESS_MIN * 100)}
            max={100}
            step={5}
            value={percent}
            aria-valuetext={`${percent}%`}
            onChange={(event) => setBrightness(Number(event.target.value) / 100)}
          />
          <span className="w-10 shrink-0 text-right text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {percent}%
          </span>
        </label>
      ) : null}
    </>
  )
}

/**
 * The hint for a template with a part that looks like a key: a shared link includes the template, so it shares the
 * key too. Shown while the template is the background shown.
 */
function TemplateHint(props: { template: string }) {
  const names = keyLikeNames(props.template)
  if (names.length === 0) return null
  return (
    <p className="px-4 pb-3 text-xs text-amber-800 dark:text-amber-300">
      This template has a part that looks like a key ({names.join(', ')}). A shared link includes
      the template, so it shares that key too.
    </p>
  )
}

/**
 * One saved custom background. Its two buttons fade in on hover and focus; a delete asks once,
 * inline, with Yes and No in the row.
 */
function CustomRow(props: {
  entry: CustomEntry
  selected: boolean
  asking: boolean
  onSelect: () => void
  onEdit: () => void
  onAsk: () => void
  onCancelAsk: () => void
  onDelete: () => void
}) {
  const { entry, selected, asking, onSelect, onEdit, onAsk, onCancelAsk, onDelete } = props
  const label = shortLabel(entry.template)
  const check = checkTemplate(entry.template)
  return (
    <div className="group flex min-w-0 items-center gap-1">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={classes(
          'flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500',
          toolButtonTone(selected ? 'selected' : 'idle'),
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">
            {entry.name || label || 'Custom background'}
          </span>
          <span className={classes('ml-auto shrink-0', MUTED)}>Custom</span>
        </span>
        {entry.name && label ? (
          <span className={classes('w-full truncate', MUTED)}>{label}</span>
        ) : null}
        {check.ok ? null : (
          <span className="w-full text-red-700 dark:text-red-400">{check.reason}</span>
        )}
      </button>
      {asking ? (
        <span className="flex shrink-0 items-center gap-1 pr-1 text-xs">
          <span>Delete?</span>
          <button type="button" className={TEXT_BUTTON} onClick={onDelete}>
            Yes
          </button>
          <button type="button" className={TEXT_BUTTON} onClick={onCancelAsk}>
            No
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 gap-0.5 pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Tooltip label="Edit custom background">
            <button
              type="button"
              aria-label="Edit custom background"
              className={ICON_BUTTON}
              onClick={onEdit}
            >
              <PencilIcon aria-hidden="true" className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Delete this custom background">
            <button
              type="button"
              aria-label="Delete this custom background"
              className={ICON_BUTTON}
              onClick={onAsk}
            >
              <TrashIcon aria-hidden="true" className="size-4" />
            </button>
          </Tooltip>
        </span>
      )}
    </div>
  )
}

/**
 * The inline form to add or edit a custom background: a name (optional), a tile URL template, the
 * tokens that work, a note on rights, and Save and Cancel. Save waits for a template that works.
 */
function CustomForm(props: {
  entry: CustomEntry | null
  onSave: (name: string, template: string) => SaveResult
  onCancel: () => void
}) {
  const { entry, onSave, onCancel } = props
  const id = useId()
  const reasonId = `${id}-reason`
  const [name, setName] = useState(entry?.name ?? '')
  const [template, setTemplate] = useState(entry?.template ?? '')
  const check = checkTemplate(template)
  // an empty template is not an error yet: the reason shows once there is something to refuse
  const reason = check.ok || template.trim() === '' ? null : check.reason

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (check.ok) onSave(name, template)
  }

  return (
    <form
      onSubmit={submit}
      aria-label={entry ? 'Edit custom background' : 'Add custom background'}
      className="flex flex-col gap-3 border-y border-zinc-950/5 px-4 py-3 text-sm dark:border-white/5"
    >
      <label className="flex flex-col gap-1">
        <span>Name (optional)</span>
        <input
          {...PLAIN_INPUT}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`h-8 ${FIELD}`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Tile URL template</span>
        <textarea
          {...PLAIN_INPUT}
          rows={3}
          spellCheck={false}
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          placeholder="https://tiles.example.org/{z}/{x}/{y}.png"
          aria-invalid={reason !== null}
          aria-describedby={reason !== null ? reasonId : undefined}
          className={`py-1.5 font-mono text-xs ${FIELD}`}
        />
      </label>
      {reason !== null ? (
        <p id={reasonId} className="text-red-700 dark:text-red-400">
          {reason}
        </p>
      ) : null}

      <details>
        <summary className="cursor-pointer text-xs font-medium">Tokens that work</summary>
        <ul className="mt-2 flex flex-col gap-2">
          {TOKEN_EXAMPLES.map((item) => (
            <li key={item.label} className="flex flex-col gap-0.5">
              <span className="text-xs">{item.label}</span>
              <code className="block text-xs break-all text-zinc-600 dark:text-zinc-300">
                {item.example}
              </code>
            </li>
          ))}
        </ul>
        <p className={classes('mt-2', MUTED)}>{MORE_TOKENS}</p>
      </details>

      <p className={MUTED}>{RIGHTS}</p>

      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={!check.ok}>
          Save
        </button>
      </div>
    </form>
  )
}

/**
 * A background row. A series is one row, with its dates as always-visible chips under it: a click
 * on the row selects the default date, a chip selects that date. The row looks chosen while one of
 * its dates is drawn, and the chip of that date is marked (aria-pressed). Chips follow the row in
 * the tab order, so no arrow keys are needed.
 */
function SeriesChoice(props: { row: SeriesRow; onSelect: (id: string) => void }) {
  const { row, onSelect } = props
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Choice
        name={row.name}
        detail={row.category}
        attribution={row.attributionText}
        best={row.best}
        selected={row.selected}
        onSelect={() => onSelect(row.defaultId)}
      />
      {row.chips.length > 0 ? (
        <div role="group" aria-label={`${row.name}: dates`} className="flex flex-wrap gap-1 pl-2.5">
          {row.chips.map((chip) => (
            <DateChip key={chip.id} chip={chip} onSelect={() => onSelect(chip.id)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** One date of a series: a small button, marked when it is the drawn background, and the best one */
function DateChip(props: { chip: SeriesChip; onSelect: () => void }) {
  const { chip, onSelect } = props
  return (
    <button
      type="button"
      aria-pressed={chip.active}
      title={chip.name}
      onClick={onSelect}
      className={classes(
        'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs tabular-nums inset-ring-1 inset-ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10',
        toolButtonTone(chip.active ? 'selected' : 'idle'),
      )}
    >
      <span>{chip.label}</span>
      {chip.best ? (
        <span className="rounded-sm bg-blue-100 px-1 text-[10px] leading-4 font-medium text-blue-800 dark:bg-blue-400/15 dark:text-blue-300">
          Best
        </span>
      ) : null}
    </button>
  )
}

/** One choice of the background: a button that looks chosen when it is, with the layer's attribution */
function Choice(props: {
  name: string
  detail?: string
  attribution?: string
  best?: boolean
  selected: boolean
  onSelect: () => void
}) {
  const { name, detail, attribution, best, selected, onSelect } = props
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={classes(
        'flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500',
        toolButtonTone(selected ? 'selected' : 'idle'),
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium">{name}</span>
        {best ? (
          <span className="shrink-0 rounded-sm bg-blue-100 px-1 text-[10px] leading-4 font-medium text-blue-800 dark:bg-blue-400/15 dark:text-blue-300">
            Best
          </span>
        ) : null}
        {detail ? (
          <span className={classes('ml-auto shrink-0 truncate', MUTED)}>{detail}</span>
        ) : null}
      </span>
      {attribution ? (
        <span className={classes('line-clamp-2 w-full', MUTED)}>{attribution}</span>
      ) : null}
    </button>
  )
}
