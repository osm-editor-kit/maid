import { m } from '@osm-editor-kit/maid-i18n'
import { browseOf, type LonLat, type Preset } from '@osm-editor-kit/maid-presets'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { notify, PresetPicker } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { changeTypeMany, presetsForAll, useFavouriteRows } from '../favourites'
import { useEngine, useShell } from '../shell-context'
import { distinctPresets, refusalMessage, typeLabel } from './multi-logic'
import { PresetIcon } from './PresetIcon'

/** The types shown as icons on the type line; the rest are counted in the label (as MultiInspector) */
const TYPE_ICONS = 3

/**
 * What the type line and the picker need from the engine, read on every render (see `useEngine`): the
 * distinct presets of the features, their distinct geometries, and a place for them (the middle of the
 * box of their centres; iD uses the middle of their joined extent).
 */
function typeOf(engine: MaidEngine, ids: readonly string[]) {
  const entities = ids.flatMap((id) => {
    const entity = engine.entity(id)
    return entity ? [entity] : []
  })
  const centres = ids.flatMap((id) => {
    const centre = engine.centreOf(id)
    return centre ? [centre] : []
  })
  return {
    distinct: distinctPresets(entities.map((entity) => entity.preset)),
    geometries: [...new Set(entities.map((entity) => entity.geometry))],
    loc: middleOf(centres),
  }
}

/** The middle of the box around these places; undefined for none */
function middleOf(points: readonly LonLat[]): LonLat | undefined {
  const first = points[0]
  if (!first) return undefined
  let [west, south] = first
  let [east, north] = first
  for (const [lon, lat] of points) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [(west + east) / 2, (south + north) / 2]
}

/**
 * The type of several features, as iD's feature type section shows it for a selection: the icons and
 * the label ("Multiple types" when they differ), a button that opens the type picker. iD offers the
 * picker for any selection and lists only the presets that take every geometry of the features
 * (`presetsForAll`). Picking a type gives each feature its own new tags, in one undo step
 * (`changeTypeMany`). A read-only feature among them refuses the whole change, with a message.
 */
export function MultiType({ ids }: { ids: readonly string[] }) {
  const { editor, engine } = useShell()
  const [open, setOpen] = useState(false)
  const info = useEngine((current) => typeOf(current, ids))
  // the favourites are per geometry: with one geometry among the features, they are offered
  const favourites = useFavouriteRows(info.geometries.length === 1 ? info.geometries[0] : undefined)
  const { presets } = editor

  const pick = (preset: Preset) => {
    setOpen(false)
    const result = changeTypeMany({ editor, engine }, ids, preset)
    if (result.ok) return
    notify.failed(refusalMessage(result))
  }

  const shownFeatures = info.distinct.slice(0, TYPE_ICONS)
  const onlyPreset = info.distinct.length === 1 ? info.distinct[0]?.preset.id : undefined

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!presets}
        aria-expanded={open}
        title="Change the feature type"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-950/5 disabled:opacity-50 dark:hover:bg-white/10"
      >
        <span className="flex shrink-0 items-center">
          {shownFeatures.map(({ preset }) => (
            <PresetIcon
              key={preset.id}
              icon={preset.icon}
              className="size-5 fill-zinc-700 dark:fill-zinc-200"
            />
          ))}
        </span>
        <span className="min-w-0 truncate">{typeLabel(info.distinct)}</span>
      </button>
      {open && presets && (
        <div className="rounded-md p-3 inset-ring-1 inset-ring-zinc-950/10 dark:inset-ring-white/10">
          <PresetPicker
            autoFocus
            currentId={onlyPreset}
            search={(query) => presetsForAll(presets, query, info.geometries, info.loc)}
            browse={browseOf(presets, info.geometries, info.loc)}
            texts={{
              recent: m.picker_recent(),
              expand: m.picker_category_expand(),
              collapse: m.picker_category_collapse(),
            }}
            renderIcon={(preset) => (
              <PresetIcon icon={preset.icon} className="fill-zinc-700 dark:fill-zinc-200" />
            )}
            favourites={favourites}
            onPick={pick}
          />
        </div>
      )}
    </div>
  )
}
