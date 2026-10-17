import type { Editor } from '@osm-editor-kit/maid-core'
import type {
  Geometry,
  LonLat,
  Preset,
  PresetOptions,
  Presets,
  Tags,
} from '@osm-editor-kit/maid-presets'
import type { ChangeTagsResult, Mode } from '@osm-editor-kit/maid-renderer'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import {
  findFavouriteByNumber,
  getSettings,
  settingsActions,
  useStoredFavourites,
  type FavouriteEntry,
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
 * A favourite that started adding a feature: the feature gets its tags when it is made, where it is
 * made (a field with a location set depends on that place). The favourite is dropped as soon as the
 * editor leaves its mode, so a later click cannot take it.
 */
const pending: {
  current?: { mode: Mode; preset: Preset; geometry: Geometry; presets: Presets }
} = {}

/** The options that give presets the place a feature is at; none when the place is not known */
const at = (loc: LonLat | undefined): PresetOptions | undefined => (loc ? { loc } : undefined)

/** Called once by the shell, when it makes the engine */
export function watchFavourites(engine: MaidEngine) {
  engine.subscribe(() => {
    if (pending.current && engine.mode !== pending.current.mode) pending.current = undefined
  })
}

/**
 * Every favourite, whatever its geometry, as the type picker and the favourites panel list them: its preset, its number
 * and its geometry, in their order. A favourite whose preset the presets do not have is left out.
 */
export function useFavouriteEntries(): FavouriteEntry[] {
  const favourites = useStoredFavourites()
  const { editor } = useShell()
  return favouriteEntries(favourites, editor.presets)
}

/**
 * The stored favourites as the picker lists them. A relation is no favourite (it cannot be drawn), so a stored
 * entry of geometry `relation` is left out, as is one whose preset the presets do not have.
 */
export function favouriteEntries(
  favourites: readonly { presetId: string; number: string; geometry: Geometry }[],
  presets: Presets | undefined,
): FavouriteEntry[] {
  if (!presets) return []
  return favourites.flatMap((favourite) => {
    if (favourite.geometry === 'relation') return []
    const preset = presets.preset(favourite.presetId)
    return preset ? [{ preset, number: favourite.number, geometry: favourite.geometry }] : []
  })
}

/**
 * Makes the preset a favourite for the geometry, or takes it out again. A relation cannot be drawn, so it is never
 * a favourite: nothing happens for geometry `relation`.
 */
export function toggleFavourite(preset: Preset, geometry: Geometry) {
  if (geometry === 'relation') return
  settingsActions.toggleFavourite(preset.id, geometry)
}

/** Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry */
export function moveFavourite(preset: Preset, geometry: Geometry, delta: 1 | -1) {
  settingsActions.moveFavourite(preset.id, geometry, delta)
}

/**
 * Gives a favourite the number the person typed in the list. A number another favourite has swaps
 * the two. The settings store keeps the change; an invalid number changes nothing.
 */
export function setFavouriteNumber(preset: Preset, geometry: Geometry, number: string) {
  settingsActions.setFavouriteNumber(preset.id, geometry, number)
}

/**
 * Gives a feature the type of a preset, as the type picker does: one undo step with the same
 * annotation.
 */
export function changeType({ editor, engine }: Parts, id: string, preset: Preset) {
  const entity = engine.entity(id)
  const { presets } = editor
  if (!entity || !presets) return
  const tags = presets.applyPreset(
    entity.tags,
    preset,
    entity.geometry,
    entity.preset,
    at(engine.centreOf(id)),
  )
  engine.setTags(id, tags, `Changed the feature type to ${preset.name}`)
}

/**
 * Gives several features the type of a preset, as iD's preset list does for a selection: each feature
 * gets the new preset's tags computed from its own tags, its own old preset and its own place, and all
 * of them change in one undo step. Refused as a whole (nothing written) when one is read-only, and
 * `missing` when a feature is not in the data. `annotation` is the undo label; iD writes "Changed tags".
 */
export function changeTypeMany(
  { editor, engine }: Parts,
  ids: readonly string[],
  preset: Preset,
  annotation = 'Changed tags',
): ChangeTagsResult {
  const { presets } = editor
  if (!presets) return { ok: false, reason: 'missing' }
  const changes: { id: string; tags: Tags }[] = []
  for (const id of new Set(ids)) {
    const entity = engine.entity(id)
    if (!entity) return { ok: false, reason: 'missing' }
    const tags = presets.applyPreset(
      entity.tags,
      preset,
      entity.geometry,
      entity.preset,
      at(engine.centreOf(id)),
    )
    changes.push({ id, tags })
  }
  return engine.setTagsEach(changes, annotation)
}

/**
 * The presets the type picker lists for several features: those that take every geometry of them, as
 * iD's preset list does for a selection (`matchAllGeometry` of the geometries present). The candidates
 * are the best 500 that `search` finds for the first geometry; the first 50 of those that take all of
 * them are kept, in search order.
 * @param   presets    - The editor's presets
 * @param   query      - What the person typed (empty for the defaults)
 * @param   geometries - The distinct geometries of the features; none gives no presets
 * @param   loc        - The place of the features, for presets with a location set
 */
export function presetsForAll(
  presets: Presets,
  query: string,
  geometries: readonly Geometry[],
  loc?: LonLat,
): Preset[] {
  const [first] = geometries
  if (first === undefined) return []
  return presets
    .search(query, first, 500, loc)
    .filter((preset) => presets.matchAllGeometry(preset, [...geometries]))
    .slice(0, 50)
}

/**
 * A favourite started by its number (favourites-keys.ts: Alt with the digits). With one feature
 * selected whose geometry the favourite has, that feature gets the favourite's type. With nothing
 * selected, it starts adding a feature of the favourite's type: the mode for its geometry is
 * switched on and the feature is made with the favourite's tags. Otherwise, or for a number that
 * no favourite has, it does nothing.
 */
export function startFavourite({ editor, engine }: Parts, number: string) {
  const favourite = findFavouriteByNumber(getSettings().favourites, number)
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

  startAdding({ editor, engine }, preset, favourite.geometry)
}

/**
 * Starts adding a feature of a preset in the mode of a geometry: the feature is made with the preset's tags. The
 * favourites use it, and the favourites panel starts a favourite as any of its geometries. Nothing happens for a
 * geometry the editor does not add, or when the editor does not switch to its mode.
 */
export function startAdding({ editor, engine }: Parts, preset: Preset, geometry: Geometry) {
  const mode = ADD_MODE[geometry]
  const { presets } = editor
  if (!mode || !presets) return
  // the mode first: switching it can finish a drawing, and that must not see the new favourite
  if (!engine.setMode(mode)) return
  pending.current = { mode, preset, geometry, presets }
}

/** Adds a point at a place on the map. A favourite that started the point mode gives it its tags. */
export function addPointWithFavourite({ engine }: Pick<Parts, 'engine'>, lon: number, lat: number) {
  const found = pending.current
  if (!found || found.mode !== 'add-point') return engine.addPoint(lon, lat)
  pending.current = undefined
  // the point is made where it is clicked: its location decides which fields with a location set apply
  const tags = found.presets.applyPreset(
    {},
    found.preset,
    found.geometry,
    undefined,
    at([lon, lat]),
  )
  return engine.addPoint(lon, lat, tags)
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
  const tags = presets.applyPreset(
    entity.tags,
    found.preset,
    entity.geometry,
    entity.preset,
    at(engine.centreOf(id)),
  )
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
  const tags = found.presets.applyPreset(
    {},
    found.preset,
    found.geometry,
    undefined,
    at(engine.centreOf(id)),
  )
  engine.setTags(id, tags, `Changed the feature type to ${found.preset.name}`)
}
