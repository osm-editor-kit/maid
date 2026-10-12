import type { Editor } from '@osm-editor-kit/maid-core'
/**
 * The "Data layers" flyout: the list of layers with a switch each, and the form that adds one.
 */
import { toolButtonTone } from '@osm-editor-kit/maid-ui'
import { useId, useMemo, useState, type ComponentType, type FormEvent } from 'react'
import { addDataLayer, type Added, type AddInput } from './add.ts'
import { ColorSwatches } from './ColorSwatches.tsx'
import {
  DATA_LAYER_KINDS,
  KIND_LABEL,
  guessKind,
  pickColor,
  type DataLayer,
  type DataLayerConfig,
  type DataLayerKind,
} from './config.ts'
import { layersOf } from './layers.ts'
import type { DataLayerStoreHook } from './store.ts'

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
      aria-label={`Show ${label}`}
      title={checked ? 'Shown: click to hide' : 'Hidden: click to show'}
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
      ? 'From a file, not kept after a reload'
      : layer.origin === 'config'
        ? `Set by the editor · ${layer.url}`
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
          {KIND_LABEL[layer.kind]} · {detail}
        </p>
        {problem ? <p className="text-xs text-red-600 dark:text-red-400">{problem}</p> : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 cursor-pointer rounded-sm text-xs font-medium text-zinc-600 hover:text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:hover:text-white"
        >
          Remove
        </button>
      ) : (
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">Editor</span>
      )}
    </li>
  )
}

const KIND_HINT: Record<DataLayerKind, string> = {
  geojson: 'An address of GeoJSON, or a file from your computer.',
  pmtiles: 'The layer names are read from the file.',
  vector: 'The address has {z}, {x} and {y}. Name the source layers below.',
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
      <div
        role="radiogroup"
        aria-label="Kind of data"
        className="isolate inline-flex w-fit rounded-md shadow-xs dark:shadow-none [&>*]:rounded-none [&>*+*]:-ml-px [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md"
      >
        {DATA_LAYER_KINDS.map((option) => {
          const checked = option === kind
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChoose(option)}
              className={`relative inline-flex h-8 items-center px-3 text-sm font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 ${toolButtonTone(checked ? 'selected' : 'idle')}`}
            >
              {KIND_LABEL[option]}
            </button>
          )
        })}
      </div>
      <p className={HINT}>
        {chosen ? KIND_HINT[kind] : `${KIND_HINT[kind]} Guessed from the address.`}
      </p>
    </div>
  )
}

function AddLayerForm({
  colors,
  onAdded,
}: {
  colors: readonly string[]
  onAdded: (added: Added) => void
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
    const result = await addDataLayer(input)
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
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Add a layer</h3>
      <label className="flex flex-col gap-1" htmlFor={`${ids}-name`}>
        <span className={LABEL}>Name</span>
        <input
          id={`${ids}-name`}
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Bike parking"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Kind</span>
        <KindChoice kind={kind} chosen={chosen !== undefined} onChoose={setChosen} />
      </div>
      <label className="flex flex-col gap-1" htmlFor={`${ids}-url`}>
        <span className={LABEL}>Address</span>
        <input
          id={`${ids}-url`}
          className={INPUT}
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={kind === 'vector' ? 'https://…/{z}/{x}/{y}.pbf' : 'https://…'}
        />
      </label>
      {kind === 'geojson' ? (
        <label className="flex flex-col gap-1" htmlFor={`${ids}-file`}>
          <span className={LABEL}>Or a GeoJSON file</span>
          <input
            key={fileInputKey}
            id={`${ids}-file`}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="h-8 w-full min-w-0 cursor-pointer rounded-md border border-zinc-950/10 bg-white pr-2 pl-1 text-sm text-zinc-500 file:mr-3 file:h-6 file:cursor-pointer file:rounded-sm file:border-0 file:bg-zinc-100 file:px-2.5 file:text-xs file:font-semibold file:text-zinc-950 hover:border-zinc-950/20 hover:file:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400 dark:[color-scheme:dark] dark:file:bg-white/10 dark:file:text-white dark:hover:border-white/20 dark:hover:file:bg-white/20"
            onChange={(event) => {
              const chosenFile = event.target.files?.[0]
              setFile(chosenFile)
              if (chosenFile && name.trim() === '') setName(chosenFile.name.replace(/\.[^.]+$/, ''))
            }}
          />
          <span className={HINT}>
            A file is kept only until the page is reloaded. When a file is chosen, the address is
            not used.
          </span>
        </label>
      ) : null}
      {kind === 'vector' ? (
        <label className="flex flex-col gap-1" htmlFor={`${ids}-layers`}>
          <span className={LABEL}>Source layers</span>
          <input
            id={`${ids}-layers`}
            className={INPUT}
            value={sourceLayers}
            onChange={(event) => setSourceLayers(event.target.value)}
            placeholder="buildings, roads"
          />
          <span className={HINT}>The names of the layers in the tiles, separated by commas.</span>
        </label>
      ) : null}
      <div className="flex items-center gap-3">
        <span className={LABEL}>Colour</span>
        <ColorSwatches label="Colour" value={color} onChange={setColor} />
      </div>
      {errors.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-xs text-red-600 dark:text-red-400">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className={HINT}>
          An address is requested once, now, to check it. A layer is only requested while it is
          shown.
        </span>
        <button
          type="submit"
          disabled={busy}
          className="h-8 shrink-0 cursor-pointer rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Add layer'}
        </button>
      </div>
    </form>
  )
}

/** The flyout of the module: the layers and the form. The store is the module's own. */
export function createPanel(
  useStore: DataLayerStoreHook,
  config: readonly DataLayerConfig[],
): ComponentType<{ editor: Editor }> {
  function DataLayersPanel() {
    const added = useStore((state) => state.added)
    const files = useStore((state) => state.files)
    const hidden = useStore((state) => state.hidden)
    const problems = useStore((state) => state.problems)
    const addLayer = useStore((state) => state.addLayer)
    const addFile = useStore((state) => state.addFile)
    const remove = useStore((state) => state.remove)
    const setHidden = useStore((state) => state.setHidden)
    const layers = useMemo(() => layersOf(config, added, files), [added, files])
    const colors = useMemo(() => layers.map((layer) => layer.color), [layers])
    return (
      <div>
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-base font-semibold">Data layers</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Other data, drawn under the OSM features so that you can still edit what is on top.
          </p>
        </div>
        {layers.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No data layers yet.</p>
        ) : (
          <ul className="px-4">
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                visible={!hidden.includes(layer.id)}
                problem={problems[layer.id]}
                onVisible={(visible) => setHidden(layer.id, !visible)}
                onRemove={layer.origin === 'config' ? undefined : () => remove(layer.id)}
              />
            ))}
          </ul>
        )}
        <AddLayerForm
          colors={colors}
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
