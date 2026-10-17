import { TrashIcon } from '@heroicons/react/20/solid'
import type { Preset } from '@osm-editor-kit/maid-presets'
import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { FavouriteNumberField } from './FavouriteNumberField.tsx'
import {
  drawableGeometries,
  isDrawnGeometry,
  type DrawnGeometry,
  type FavouriteEntry,
  type FavouriteTexts,
} from './favourites.ts'
import { GeometryIcon } from './GeometryIcons.tsx'
import { ICON_BUTTON, ICON_TONE } from './icon-button.ts'

/**
 * The favourites as a list: one row each, with the preset's icon and name, the geometries the preset can be drawn as
 * (a button each: it starts the preset as that geometry), its number (a field) and a trash button that removes it.
 * The number and the trash sit at the same place in every row, whatever the number of geometry buttons.
 * The editor's flyout holds it (packages/shell/src/components/FavouritesButton.tsx).
 */
export function FavouritesPanel(props: {
  entries: readonly FavouriteEntry[]
  /** Draws a preset's icon. Without it the rows have no icon. */
  renderIcon?: (preset: Preset) => ReactNode
  texts: FavouriteTexts
  /** Shown instead of the list when there are no favourites */
  empty: ReactNode
  onSetNumber: (entry: FavouriteEntry, number: string) => void
  onRemove: (entry: FavouriteEntry) => void
  onStart: (entry: FavouriteEntry, geometry: DrawnGeometry) => void
}) {
  const { entries, renderIcon, texts, empty, onSetNumber, onRemove, onStart } = props
  if (entries.length === 0)
    return <p className="px-4 pb-4 text-zinc-500 dark:text-zinc-400">{empty}</p>
  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {entries.map((entry) => (
        <FavouriteItem
          key={`${entry.preset.id}/${entry.geometry}`}
          entry={entry}
          renderIcon={renderIcon}
          texts={texts}
          onSetNumber={onSetNumber}
          onRemove={onRemove}
          onStart={onStart}
        />
      ))}
    </ul>
  )
}

/** One favourite: see FavouritesPanel */
function FavouriteItem(props: {
  entry: FavouriteEntry
  renderIcon?: (preset: Preset) => ReactNode
  texts: FavouriteTexts
  onSetNumber: (entry: FavouriteEntry, number: string) => void
  onRemove: (entry: FavouriteEntry) => void
  onStart: (entry: FavouriteEntry, geometry: DrawnGeometry) => void
}) {
  const { entry, renderIcon, texts, onSetNumber, onRemove, onStart } = props
  const { preset } = entry
  const geometries = drawableGeometries(preset)
  const favouriteGeometry = isDrawnGeometry(entry.geometry) ? entry.geometry : undefined
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-950/5 dark:hover:bg-white/5">
      <span className="inline-flex size-9 shrink-0 items-center justify-center text-zinc-600 dark:text-zinc-300 [&>svg]:size-5">
        {renderIcon?.(preset)}
      </span>
      <span className="max-w-[60%] min-w-0 shrink">
        <span className="block truncate font-semibold">{preset.name}</span>
        {favouriteGeometry ? (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {texts.geometries[favouriteGeometry]}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {geometries.map((geometry) => {
          const label = texts.addAs(preset.name, texts.geometries[geometry])
          return (
            <button
              key={geometry}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => onStart(entry, geometry)}
              className={twMerge(
                ICON_BUTTON,
                'size-9 [&>svg]:size-5',
                geometry === favouriteGeometry
                  ? 'bg-zinc-950/5 text-zinc-950 dark:bg-white/10 dark:text-white'
                  : ICON_TONE,
              )}
            >
              <GeometryIcon geometry={geometry} />
            </button>
          )
        })}
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1" />
      <FavouriteNumberField
        name={preset.name}
        value={entry.number}
        title={texts.startHint(preset.name, entry.number)}
        onCommit={(number) => onSetNumber(entry, number)}
      />
      <button
        type="button"
        aria-label={texts.remove(preset.name)}
        title={texts.remove(preset.name)}
        onClick={() => onRemove(entry)}
        className={`${ICON_BUTTON} ${ICON_TONE} hover:text-rose-600 dark:hover:text-rose-400`}
      >
        <TrashIcon aria-hidden="true" className="size-4" />
      </button>
    </li>
  )
}
