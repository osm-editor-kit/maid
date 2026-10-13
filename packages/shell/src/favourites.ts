import type { Editor } from '@osm-editor-kit/maid-core'
import type { Geometry, Preset, Tags } from '@osm-editor-kit/maid-presets'
import type { Mode } from '@osm-editor-kit/maid-renderer'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import {
  favouritesFor,
  findFavouriteByNumber,
  setFavouriteNumber as setNumberIn,
  useSettings,
} from '@osm-editor-kit/maid-ui'
import { useShell } from './shell-context'

/** What the functions here act on: the editor's presets and the engine */
type Parts = { editor: Editor; engine: MaidEngine }

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

/** Called once by the shell, when it makes the engine */
export function watchFavourites(engine: MaidEngine) {
  engine.subscribe(() => {
    if (pending.current && engine.mode !== pending.current.mode) pending.current = undefined
  })
}

/** The favourites of a geometry as the type picker lists them: their presets, with their numbers */
export function useFavouriteRows(geometry: Geometry | undefined) {
  const favourites = useSettings((state) => state.favourites)
  const { editor } = useShell()
  const { presets } = editor
  if (!geometry || !presets) return []
  return favouritesFor(favourites, geometry).flatMap((favourite) => {
    const preset = presets.preset(favourite.presetId)
    return preset ? [{ preset, number: favourite.number }] : []
  })
}

/** Makes the preset a favourite for the geometry, or takes it out again */
export function toggleFavourite(preset: Preset, geometry: Geometry) {
  useSettings.getState().toggleFavourite(preset.id, geometry)
}

/** Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry */
export function moveFavourite(preset: Preset, geometry: Geometry, delta: 1 | -1) {
  useSettings.getState().moveFavourite(preset.id, geometry, delta)
}

/**
 * Gives a favourite the number the person typed in the list. A number another favourite has swaps
 * the two. The settings store keeps the change; an invalid number changes nothing.
 */
export function setFavouriteNumber(preset: Preset, geometry: Geometry, number: string) {
  // the store's own action would be the place for this; set state here keeps settings.ts unchanged
  useSettings.setState((state) => ({
    favourites: setNumberIn(state.favourites, preset.id, geometry, number),
  }))
}

/**
 * Gives a feature the type of a preset, as the type picker does: one undo step with the same
 * annotation.
 */
export function changeType({ editor, engine }: Parts, id: string, preset: Preset) {
  const entity = engine.entity(id)
  const { presets } = editor
  if (!entity || !presets) return
  const tags = presets.applyPreset(entity.tags, preset, entity.geometry, entity.preset)
  engine.setTags(id, tags, `Changed the feature type to ${preset.name}`)
}

/**
 * A favourite started by its number (favourites-keys.ts: Alt with the digits). With one feature
 * selected whose geometry the favourite has, that feature gets the favourite's type. With nothing
 * selected, it starts adding a feature of the favourite's type: the mode for its geometry is
 * switched on and the feature is made with the favourite's tags. Otherwise, or for a number that
 * no favourite has, it does nothing.
 */
export function startFavourite({ editor, engine }: Parts, number: string) {
  const favourite = findFavouriteByNumber(useSettings.getState().favourites, number)
  const preset = favourite ? editor.presets?.preset(favourite.presetId) : undefined
  if (!favourite || !preset) return

  const { selection } = engine
  if (selection.length > 1) return
  const [selected] = selection
  if (selected !== undefined) {
    const entity = engine.entity(selected)
    if (entity && !entity.readOnly && entity.geometry === favourite.geometry)
      changeType({ editor, engine }, selected, preset)
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
export function addPointWithFavourite({ engine }: Pick<Parts, 'engine'>, lon: number, lat: number) {
  const found = pending.current
  if (!found || found.mode !== 'add-point') return engine.addPoint(lon, lat)
  pending.current = undefined
  return engine.addPoint(lon, lat, found.tags)
}

/**
 * The favourite's tags for a node that "add point" did not create as a free point: an existing
 * node that was clicked, or a new node on a line. The node keeps the tags it has; the favourite's
 * are added on top, as picking that type would.
 */
export function giveFavouriteTagsToNode({ editor, engine }: Parts, id: string) {
  const found = pending.current
  if (!found || found.mode !== 'add-point') return
  pending.current = undefined
  const entity = engine.entity(id)
  const { presets } = editor
  if (!entity || !presets) return
  // as changeType: a field default only fills a key the node does not have (iD keeps existing keys),
  // so a default never overwrites a value the node already has
  const tags = presets.applyPreset(entity.tags, found.preset, entity.geometry, entity.preset)
  engine.setTags(id, tags, 'Changed the feature type')
}

/**
 * A line or an area that was just finished in `mode`. A favourite that started that mode gives it
 * its type: a second undo step, as the type picker makes one.
 */
export function giveFavouriteType({ engine }: Pick<Parts, 'engine'>, id: string, mode: Mode) {
  const found = pending.current
  if (!found || found.mode !== mode) return
  pending.current = undefined
  engine.setTags(id, found.tags, `Changed the feature type to ${found.preset.name}`)
}
