/**
 * The "Data layers" flyout: the list of layers with a switch each, and the form that adds one.
 */
import type { RemoteFetch, UrlParamHandle } from '@osm-editor-kit/maid-core'
import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { SegmentedControl } from '@osm-editor-kit/maid-ui'
import { useQueries } from '@tanstack/react-query'
import { useId, useMemo, useState, type FormEvent } from 'react'
import {
  addDataLayer,
  describeFailure,
  gpxAddressOptions,
  type Added,
  type AddInput,
} from './add.ts'
import { ColorSwatches } from './ColorSwatches.tsx'
import {
  DATA_LAYER_KINDS,
  guessKind,
  kindLabel,
  pickColor,
  type DataLayer,
  type DataLayerConfig,
  type DataLayerKind,
} from './config.ts'
import {
  useAddedLayers,
  useDataLayersActions,
  useFileLayers,
  useHiddenIds,
} from './data-layers-store.ts'
import { layersOf } from './layers.ts'
import { colorsInUse, useLinkedLayer } from './link.ts'
import { m } from './messages.ts'
import { pmtilesLayersOptions } from './pmtiles.ts'

/**
 * The problems of the PMTiles and GPX layers that the map has tried to read: the failed queries of the map
 * (`pmtilesLayersOptions`, `gpxAddressOptions`), read from the cache. Disabled here, so the panel never starts a read.
 */
function useLayerProblems(layers: readonly DataLayer[], send: RemoteFetch): Record<string, string> {
  const pmtiles = layers.filter(
    (layer) => layer.kind === 'pmtiles' && layer.sourceLayers === undefined,
  )
  const gpx = layers.filter((layer) => layer.kind === 'gpx' && layer.data === undefined)
  const pmtilesProblems = useQueries({
    queries: pmtiles.map((layer) => ({ ...pmtilesLayersOptions(layer.url, send), enabled: false })),
    combine: (results) =>
      Object.fromEntries(
        results.flatMap((result, index) => {
          const layer = pmtiles[index]
          if (!layer || !result.isError) return []
          return [[layer.id, describeFailure(result.error, 'pmtiles').message]]
        }),
      ),
  })
  const gpxProblems = useQueries({
    queries: gpx.map((layer) => ({ ...gpxAddressOptions(layer.url, send), enabled: false })),
    combine: (results) =>
      Object.fromEntries(
        results.flatMap((result, index) => {
          const layer = gpx[index]
          if (!layer || !result.isError) return []
          return [[layer.id, describeFailure(result.error, 'gpx').message]]
        }),
      ),
  })
  return { ...pmtilesProblems, ...gpxProblems }
}

const INPUT =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:hover:border-white/20 dark:[color-scheme:dark]'

const LABEL = 'text-sm font-medium text-zinc-700 dark:text-zinc-300'
const HINT = 'text-xs text-zinc-500 dark:text-zinc-400'

function VisibilitySwitch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={m.data_layers_show_aria({ name: label })}
      title={checked ? m.data_layers_shown_title() : m.data_layers_hidden_title()}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${checked ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
    >
      <span
        aria-hidden="true"
        className={`size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function LayerRow({
  layer,
  visible,
  problem,
  onVisible,
  onRemove,
}: {
  layer: DataLayer
  visible: boolean
  problem: string | undefined
  onVisible: (visible: boolean) => void
  onRemove?: () => void
}) {
  const detail =
    layer.origin === 'file'
      ? m.data_layers_detail_file()
      : layer.origin === 'config'
        ? m.data_layers_detail_config({ url: layer.url })
        : layer.origin === 'link'
          ? m.data_layers_detail_link({ url: layer.url })
          : layer.url
  return (
    <li className="flex items-center gap-3 border-b border-zinc-950/5 py-2 last:border-0 dark:border-white/5">
      <VisibilitySwitch label={layer.name} checked={visible} onChange={onVisible} />
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: layer.color }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">{layer.name}</p>
        <p className={`truncate ${HINT}`} title={layer.url || undefined}>
          {kindLabel(layer.kind)} · {detail}
        </p>
        {problem ? <p className="text-xs text-red-600 dark:text-red-400">{problem}</p> : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 cursor-pointer rounded-sm text-xs font-medium text-zinc-600 hover:text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:hover:text-white"
        >
          {m.data_layers_remove()}
        </button>
      ) : (
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {m.data_layers_editor()}
        </span>
      )}
    </li>
  )
}

/** The kinds as options of the control, read when it is shown: the label of a kind is in the language of the visit */
function kindOptions() {
  return DATA_LAYER_KINDS.map((option) => ({ value: option, label: kindLabel(option) }))
}

function kindHint(kind: DataLayerKind): string {
  switch (kind) {
    case 'geojson':
      return m.data_layers_hint_geojson()
    case 'gpx':
      return m.data_layers_hint_gpx()
    case 'pmtiles':
      return m.data_layers_hint_pmtiles()
    case 'vector':
      return m.data_layers_hint_vector({ z: '{z}', x: '{x}', y: '{y}' })
  }
}

function KindChoice({
  kind,
  chosen,
  onChoose,
}: {
  kind: DataLayerKind
  chosen: boolean
  onChoose: (kind: DataLayerKind) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <SegmentedControl
        label={m.data_layers_kind_label()}
        options={kindOptions()}
        value={kind}
        onSelect={onChoose}
        // no arrow keys here: every kind is a tab stop, and the focus ring sits on the edge
        arrowKeys={false}
        outlineOffset={false}
        className="w-fit"
      />
      <p className={HINT}>
        {chosen ? kindHint(kind) : m.data_layers_kind_guessed({ hint: kindHint(kind) })}
      </p>
    </div>
  )
}

/** What Remove does for a layer: none for the editor's own, the URL for a link, the store for the rest */
function removeOf(
  layer: DataLayer,
  remove: (id: string) => void,
  clearLink: () => void,
): (() => void) | undefined {
  if (layer.origin === 'config') return undefined
  if (layer.origin === 'link') return clearLink
  return () => remove(layer.id)
}

function AddLayerForm({
  colors,
  onAdded,
  send,
}: {
  colors: readonly string[]
  onAdded: (added: Added) => void
  /** The editor's fetch: the checks of an address go through it */
  send: RemoteFetch
}) {
  const ids = useId()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [chosen, setChosen] = useState<DataLayerKind>()
  const [sourceLayers, setSourceLayers] = useState('')
  const [color, setColor] = useState(() => pickColor(colors))
  const [file, setFile] = useState<File>()
  const [fileInputKey, setFileInputKey] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const kind = chosen ?? guessKind(url)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input: AddInput = { name, kind, url, sourceLayers, color, ...(file ? { file } : {}) }
    setBusy(true)
    const result = await addDataLayer(input, send)
    setBusy(false)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    onAdded(result.value)
    setColor(pickColor([...colors, color]))
    setName('')
    setUrl('')
    setChosen(undefined)
    setSourceLayers('')
    setFile(undefined)
    setFileInputKey((key) => key + 1)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-4 pt-3 pb-4">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
        {m.data_layers_add_title()}
      </h3>
      <label className="flex flex-col gap-1" htmlFor={`${ids}-name`}>
        <span className={LABEL}>{m.data_layers_name()}</span>
        <input
          {...PLAIN_INPUT}
          id={`${ids}-name`}
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={m.data_layers_name_placeholder()}
        />
      </label>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className={LABEL}>{m.data_layers_kind()}</legend>
        <KindChoice kind={kind} chosen={chosen !== undefined} onChoose={setChosen} />
      </fieldset>
      <label className="flex flex-col gap-1" htmlFor={`${ids}-url`}>
        <span className={LABEL}>{m.data_layers_address()}</span>
        <input
          {...PLAIN_INPUT}
          id={`${ids}-url`}
          className={INPUT}
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={kind === 'vector' ? 'https://…/{z}/{x}/{y}.pbf' : 'https://…'}
        />
      </label>
      {kind === 'geojson' || kind === 'gpx' ? (
        <label className="flex flex-col gap-1" htmlFor={`${ids}-file`}>
          <span className={LABEL}>{m.data_layers_file_label()}</span>
          <input
            {...PLAIN_INPUT}
            key={fileInputKey}
            id={`${ids}-file`}
            type="file"
            accept=".geojson,.json,.gpx,application/geo+json,application/json,application/gpx+xml"
            className="block w-full min-w-0 cursor-pointer rounded-md text-sm text-zinc-500 file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-zinc-950/10 file:bg-white file:px-3 file:text-sm file:font-medium file:text-zinc-950 hover:file:border-zinc-950/20 hover:file:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:file:border-white/10 dark:file:bg-white/5 dark:file:text-white dark:hover:file:border-white/20 dark:hover:file:bg-white/10"
            onChange={(event) => {
              const chosenFile = event.target.files?.[0]
              setFile(chosenFile)
              if (chosenFile && name.trim() === '') setName(chosenFile.name.replace(/\.[^.]+$/, ''))
            }}
          />
          <span className={HINT}>{m.data_layers_file_hint()}</span>
        </label>
      ) : null}
      {kind === 'vector' ? (
        <label className="flex flex-col gap-1" htmlFor={`${ids}-layers`}>
          <span className={LABEL}>{m.data_layers_source_layers()}</span>
          <input
            {...PLAIN_INPUT}
            id={`${ids}-layers`}
            className={INPUT}
            value={sourceLayers}
            onChange={(event) => setSourceLayers(event.target.value)}
            placeholder="buildings, roads"
          />
          <span className={HINT}>{m.data_layers_source_layers_hint()}</span>
        </label>
      ) : null}
      <div className="flex items-center gap-3">
        <span className={LABEL}>{m.data_layers_colour()}</span>
        <ColorSwatches label={m.data_layers_colour()} value={color} onChange={setColor} />
      </div>
      {errors.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-xs text-red-600 dark:text-red-400">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className={HINT}>{m.data_layers_check_hint()}</span>
        <button
          type="submit"
          disabled={busy}
          className="h-8 shrink-0 cursor-pointer rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60"
        >
          {busy ? m.data_layers_checking() : m.data_layers_add_button()}
        </button>
      </div>
    </form>
  )
}

/**
 * The flyout of the module: the layers and the form. The layer a link names is read from the query the map runs
 * (`enabled: false` here), and removing it clears the link's `data` parameter, so the URL and the list agree.
 */
export function createPanel(
  config: readonly DataLayerConfig[],
  send: RemoteFetch,
  link: UrlParamHandle<string>,
) {
  function DataLayersPanel() {
    const added = useAddedLayers()
    const files = useFileLayers()
    const hidden = useHiddenIds()
    const { addLayer, addFile, remove, setHidden } = useDataLayersActions()
    const linked = useLinkedLayer(link, send, colorsInUse(config, added, files), { load: false })
    const layers = useMemo(
      () => layersOf(config, added, files, linked.layer ? [linked.layer] : []),
      [added, files, linked.layer],
    )
    const problems = useLayerProblems(layers, send)
    const colors = useMemo(() => layers.map((layer) => layer.color), [layers])
    return (
      <div>
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-base font-semibold">{m.data_layers_label()}</h2>
          <p className="text-zinc-500 dark:text-zinc-400">{m.data_layers_intro()}</p>
        </div>
        {layers.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            {m.data_layers_empty()}
          </p>
        ) : (
          <ul className="px-4">
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                visible={!hidden.includes(layer.id)}
                problem={problems[layer.id]}
                onVisible={(visible) => setHidden(layer.id, !visible)}
                onRemove={removeOf(layer, remove, () => linked.setUrl(null))}
              />
            ))}
          </ul>
        )}
        {linked.error ? (
          <p role="alert" className="px-4 pt-2 text-xs text-red-600 dark:text-red-400">
            {m.data_layers_linked_error({ reason: linked.error })}
          </p>
        ) : null}
        <AddLayerForm
          colors={colors}
          send={send}
          onAdded={(result) => {
            if (result.kind === 'url') addLayer(result.layer)
            else addFile(result.layer)
          }}
        />
      </div>
    )
  }
  return DataLayersPanel
}
