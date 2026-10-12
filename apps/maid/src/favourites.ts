import type { Geometry, Preset, Tags } from '@osm-editor-kit/maid-presets'
import type { Mode } from '@osm-editor-kit/maid-renderer'
import {
  favouritesFor,
  findFavouriteByKey,
  isFavouritesFull,
  useSettings,
  type PickerFavourite,
} from '@osm-editor-kit/maid-ui'
import { editor, engine } from './editor'

/** The mode that adds a feature of each geometry. Vertices and relations are not added this way. */
const ADD_MODE: Partial<Record<Geometry, Mode>> = {
  point: 'add-point',
  line: 'draw-line',
  area: 'draw-area',
}

/**
 * A favourite that started adding a feature: the feature gets its tags when it is made. The
 * favourite is dropped as soon as the editor leaves its mode, so a later click cannot take it.
 */
const pending: { current?: { mode: Mode; preset: Preset; tags: Tags } } = {}

engine.subscribe(() => {
  if (pending.current && engine.mode !== pending.current.mode) pending.current = undefined
})

/** The favourites of a geometry as the type picker lists them: their presets, with their keys */
export function useFavouriteRows(geometry: Geometry | undefined): PickerFavourite[] {
  const favourites = useSettings((state) => state.favourites)
  const { presets } = editor
  if (!geometry || !presets) return []
  return favouritesFor(favourites, geometry).flatMap((favourite) => {
    const preset = presets.preset(favourite.presetId)
    return preset ? [{ preset, key: favourite.key }] : []
  })
}

/** True when every number key is taken, so no other preset can become a favourite */
export function useFavouritesFull(): boolean {
  return useSettings((state) => isFavouritesFull(state.favourites))
}

/** Makes the preset a favourite for the geometry, or takes it out again */
export function toggleFavourite(preset: Preset, geometry: Geometry): void {
  useSettings.getState().toggleFavourite(preset.id, geometry)
}

/** Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry */
export function moveFavourite(preset: Preset, geometry: Geometry, delta: 1 | -1): void {
  useSettings.getState().moveFavourite(preset.id, geometry, delta)
}

/**
 * Gives a feature the type of a preset, as the type picker does: one undo step with the same
 * annotation.
 */
export function changeType(id: string, preset: Preset): void {
  const entity = engine.entity(id)
  const { presets } = editor
  if (!entity || !presets) return
  const tags = presets.applyPreset(entity.tags, preset, entity.geometry, entity.preset)
  engine.setTags(id, tags, `Changed the feature type to ${preset.name}`)
}

/**
 * A number key of a favourite. With one feature selected whose geometry the favourite has, that
 * feature gets the favourite's type. With nothing selected, the key starts adding a feature of
 * the favourite's type: the mode for its geometry is switched on and the feature is made with the
 * favourite's tags. Otherwise the key does nothing.
 */
export function pressFavouriteKey(key: string): void {
  const favourite = findFavouriteByKey(useSettings.getState().favourites, key)
  const preset = favourite ? editor.presets?.preset(favourite.presetId) : undefined
  if (!favourite || !preset) return

  const { selection } = engine
  if (selection.length > 1) return
  const [selected] = selection
  if (selected !== undefined) {
    const entity = engine.entity(selected)
    if (entity && !entity.readOnly && entity.geometry === favourite.geometry)
      changeType(selected, preset)
    return
  }

  const mode = ADD_MODE[favourite.geometry]
  const { presets } = editor
  if (!mode || !presets) return
  // the mode first: switching it can finish a drawing, and that must not see the new favourite
  if (!engine.setMode(mode)) return
  pending.current = { mode, preset, tags: presets.applyPreset({}, preset, favourite.geometry) }
}

/** Adds a point at a place on the map. A favourite that started the point mode gives it its tags. */
export function addPointWithFavourite(lon: number, lat: number): string {
  const found = pending.current
  if (!found || found.mode !== 'add-point') return engine.addPoint(lon, lat)
  pending.current = undefined
  return engine.addPoint(lon, lat, found.tags)
}

/**
 * A line or an area that was just finished in `mode`. A favourite that started that mode gives it
 * its type: a second undo step, as the type picker makes one.
 */
export function giveFavouriteType(id: string, mode: Mode): void {
  const found = pending.current
  if (!found || found.mode !== mode) return
  pending.current = undefined
  engine.setTags(id, found.tags, `Changed the feature type to ${found.preset.name}`)
}
