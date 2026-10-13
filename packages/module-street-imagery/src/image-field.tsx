import { EyeIcon, XMarkIcon } from '@heroicons/react/20/solid'
/**
 * The "Street-level images" field: one row per image key of the feature that has a value (`;` separated ids, as
 * chips), an input per row to add an id or a link, and a select to add a row for a key without a value. A row
 * focused or clicked becomes the target of "Use this photo" in the viewer (see dock.tsx and image-keys.ts).
 */
import type { InspectorFieldType } from '@osm-editor-kit/maid-ui'
import { useEffect, useId, useState } from 'react'
import { showBlockedReason, openImageById } from './image-actions.ts'
import {
  IMAGE_KEYS,
  appendId,
  hasId,
  idFromText,
  imageKeysWithValue,
  keyLabel,
  providerOfKey,
  removeId,
  splitIds,
  type ImageProvider,
} from './image-keys.ts'
import { AUTOMATED, useStreetImageryStore } from './store.ts'

type FieldProps = Parameters<InspectorFieldType['component']>[0]

const INPUT =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:hover:border-white/20 dark:[color-scheme:dark]'
const ICON_BUTTON =
  'grid size-6 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'

/** Long ids are cut in the middle: the start and the end tell them apart. */
export function shortId(id: string) {
  return id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`
}

const GROUPS = ['Way', 'Bike lane', 'Sidewalk', 'Panoramax'] as const

/** The group of a key in the "Add" list */
function groupOf(key: string) {
  if (providerOfKey(key) === 'panoramax') return 'Panoramax'
  if (key.includes('cycleway:')) return 'Bike lane'
  if (key.includes('sidewalk:')) return 'Sidewalk'
  return 'Way'
}

export function StreetImagesField({ tags, id, onChange }: FieldProps) {
  const generated = useId()
  // the row of this field: the inspector gives an id per row, which stays while the value changes
  const rowId = id ?? generated
  // keys the person picked from the add list that have no value yet; they are rows until a value is added
  const [picked, setPicked] = useState<string[]>([])
  const setImageWriter = useStreetImageryStore((state) => state.setImageWriter)

  // registered on every render, so "Use this photo" writes with the tags and change function of this feature
  useEffect(() => {
    if (!onChange) return
    setImageWriter({ rowId, tags, onChange })
  }, [rowId, tags, onChange, setImageWriter])

  // when the row goes (another feature is selected), its writer and its active row go with it
  useEffect(() => {
    return () => {
      const state = useStreetImageryStore.getState()
      if (state.imageWriter?.rowId === rowId) state.setImageWriter(null)
      if (state.activeImage?.rowId === rowId) state.setActiveImage(null)
    }
  }, [rowId])

  const shown = [...new Set([...imageKeysWithValue(tags), ...picked])]
  const free = IMAGE_KEYS.filter((key) => !shown.includes(key) && splitIds(tags[key]).length === 0)
  const groups = GROUPS.map(
    (group) => [group, free.filter((key) => groupOf(key) === group)] as const,
  ).filter(([, keys]) => keys.length > 0)

  return (
    <div className="grid gap-2">
      {shown.map((key) => (
        <ImageRow key={key} rowId={rowId} imageKey={key} value={tags[key]} onChange={onChange} />
      ))}
      {onChange && free.length > 0 ? (
        <select
          aria-label="Add an image key"
          className={INPUT}
          value=""
          onChange={(event) => {
            const key = event.currentTarget.value
            if (key !== '') setPicked((keys) => (keys.includes(key) ? keys : [...keys, key]))
          }}
        >
          <option value="">Add an image key…</option>
          {groups.map(([group, keys]) => (
            <optgroup key={group} label={group}>
              {keys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : null}
    </div>
  )
}

/** One image key: its ids as chips (show, remove) and an input to add one */
function ImageRow({
  rowId,
  imageKey,
  value,
  onChange,
}: {
  rowId: string
  imageKey: string
  value: string | undefined
  onChange: FieldProps['onChange']
}) {
  const provider: ImageProvider = providerOfKey(imageKey) ?? 'mapillary'
  const isActive = useStreetImageryStore(
    (state) =>
      state.activeImage !== null &&
      state.activeImage.rowId === rowId &&
      state.activeImage.key === imageKey,
  )
  const mapillaryToken = useStreetImageryStore((state) => state.mapillaryToken)
  const setActiveImage = useStreetImageryStore((state) => state.setActiveImage)
  const [text, setText] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const ids = splitIds(value)
  const blocked = showBlockedReason(imageKey, mapillaryToken, AUTOMATED)
  const activate = () => setActiveImage({ rowId, key: imageKey })

  const add = () => {
    if (!onChange || text.trim() === '') return
    const parsed = idFromText(provider, text)
    if ('error' in parsed) {
      setInputError(parsed.error)
      return
    }
    if (hasId(value, parsed.id)) {
      setInputError('Already in this key')
      return
    }
    onChange(imageKey, appendId(value, parsed.id))
    setText('')
    setInputError(null)
  }

  const show = (imageId: string) => {
    setOpening(imageId)
    setOpenError(null)
    openImageById(imageId).then(
      (error) => {
        setOpening(null)
        setOpenError(error)
      },
      () => {
        setOpening(null)
        setOpenError('Could not load this photo')
      },
    )
  }

  return (
    <div
      role="group"
      aria-label={`${keyLabel(imageKey)} (${imageKey})`}
      data-image-key={imageKey}
      onFocus={activate}
      onPointerDown={activate}
      className={`grid gap-1.5 rounded-md p-1.5 ${isActive ? 'bg-blue-500/5 ring-2 ring-blue-500' : 'ring-1 ring-transparent'}`}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-300">
          {keyLabel(imageKey)}
        </span>
        <span className="shrink-0 truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {isActive ? 'target · ' : ''}
          {imageKey}
        </span>
      </div>
      {ids.length > 0 ? (
        <ul className="grid gap-1">
          {ids.map((imageId) => (
            <li
              key={imageId}
              className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-zinc-950/10 pr-1 pl-2 dark:border-white/10"
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-950 dark:text-white"
                title={imageId}
              >
                {shortId(imageId)}
              </span>
              <button
                type="button"
                className={ICON_BUTTON}
                disabled={blocked !== null || opening !== null}
                title={blocked ?? (opening === imageId ? 'Loading…' : 'Show in the viewer')}
                aria-label={`Show ${imageId} in the viewer`}
                onClick={() => show(imageId)}
              >
                <EyeIcon aria-hidden="true" className="size-4" />
              </button>
              {onChange ? (
                <button
                  type="button"
                  className={ICON_BUTTON}
                  title={`Remove ${imageId}`}
                  aria-label={`Remove ${imageId}`}
                  onClick={() => onChange(imageKey, removeId(value, imageId))}
                >
                  <XMarkIcon aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {openError !== null ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {openError}
        </p>
      ) : null}
      {onChange ? (
        <>
          <input
            type="text"
            dir="ltr"
            aria-label={`Add to ${imageKey}`}
            aria-invalid={inputError !== null}
            placeholder={
              provider === 'mapillary'
                ? 'Add an id or a Mapillary link'
                : 'Add an id or a Panoramax link'
            }
            value={text}
            className={INPUT}
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            onBlur={add}
          />
          {inputError !== null ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {inputError}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
