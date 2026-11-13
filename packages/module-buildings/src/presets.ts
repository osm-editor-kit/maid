/**
 * The building presets of Maid Buildings: what a building mapping campaign needs first.
 * - `buildingPresetChanges(data)`: every building preset shows the levels together, in one order: levels, levels
 *   underground, roof levels, as the kaligrafy iD fork does (branch feat/building-levels-always-visible, 2026-07: "always
 *   show building levels fields, regardless of other tags"); the residential types also show the number of dwellings,
 *   which the map style colours. The schema has no field for `roof:levels`; it is added here.
 * - `withBuildingDefaults`: the building types first in the type picker (iD's defaults per geometry).
 * - `BUILDING_FAVOURITES`: the favourites the app suggests, while the person has none of their own.
 */
import type {
  FieldPlacement,
  PresetChanges,
  PresetData,
  PresetEdit,
} from '@osm-editor-kit/maid-presets'
import { m } from './messages.ts'

const LEVELS = 'building/levels'
const UNDERGROUND = 'building/levels/underground'
const ROOF_LEVELS = 'roof_levels'
const FLATS = 'building/flats'

/** The types where the number of dwellings is asked for (`building/apartments` has the field already) */
const RESIDENTIAL = new Set([
  'building',
  'building/house',
  'building/house/terraced',
  'building/detached',
  'building/semidetached_house',
  'building/terrace',
  'building/residential',
  'building/bungalow',
  'building/dormitory',
  'building/farm',
  'building/apartments',
])

/** No storeys to count: a roof on posts, a carport, a building site, a tent */
const NO_LEVELS = new Set([
  'building/roof',
  'building/carport',
  'building/construction',
  'building/tent',
  'building/ruins',
])

function fieldsOf(raw: unknown): string[] | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const fields = (raw as { fields?: unknown }).fields
  if (fields === undefined) return []
  if (!Array.isArray(fields) || !fields.every((field) => typeof field === 'string'))
    return undefined
  return fields as string[]
}

function geometryOf(raw: unknown): string[] {
  const geometry = (raw as { geometry?: unknown }).geometry
  return Array.isArray(geometry) ? (geometry as string[]) : []
}

/** The edits for one building preset: levels, levels underground and roof levels after its name, the dwellings after */
function editFor(id: string, fields: readonly string[]): PresetEdit | undefined {
  // a preset that takes its fields from another one (`{building}`) keeps them
  if (fields.some((field) => field.startsWith('{'))) return undefined
  const add: FieldPlacement[] = []
  if (!fields.includes(LEVELS))
    add.push(fields.includes('name') ? { id: LEVELS, after: 'name' } : LEVELS)
  if (!fields.includes(UNDERGROUND)) add.push({ id: UNDERGROUND, after: LEVELS })
  add.push({ id: ROOF_LEVELS, after: UNDERGROUND })
  if (RESIDENTIAL.has(id) && !fields.includes(FLATS)) add.push({ id: FLATS, after: ROOF_LEVELS })
  return { addFields: add }
}

/**
 * The changes for the presets in `data`: the field `roof_levels`, and the level fields on every area preset whose id is
 * `building` or starts with `building/` (except roofs, carports, building sites, tents and ruins).
 */
export function buildingPresetChanges(data: PresetData): PresetChanges {
  const presetEdits: Record<string, PresetEdit> = {}
  for (const [id, raw] of Object.entries(data.presets)) {
    if (id !== 'building' && !id.startsWith('building/')) continue
    if (NO_LEVELS.has(id) || !geometryOf(raw).includes('area')) continue
    const fields = fieldsOf(raw)
    if (!fields) continue
    const edit = editFor(id, fields)
    if (edit) presetEdits[id] = edit
  }
  return {
    fields: {
      [ROOF_LEVELS]: {
        type: 'number',
        key: 'roof:levels',
        get label() {
          return m.field_roof_levels()
        },
        minValue: 0,
      },
    },
    presetEdits,
  }
}

/** The presets first in the type picker, per geometry; each list ends with iD's generic preset */
export const BUILDING_DEFAULTS = {
  area: [
    'building',
    'building/house',
    'building/detached',
    'building/semidetached_house',
    'building/terrace',
    'building/apartments',
    'building/residential',
    'building/garage',
    'building/garages',
    'building/shed',
    'building/commercial',
    'building/retail',
    'building/industrial',
    'building/roof',
    'building_part',
    'category-building',
    'area',
  ],
  point: ['address', 'point'],
  vertex: ['entrance', 'entrance/main', 'entrance/staircase', 'address', 'point'],
} as const

/** The schema's defaults with the building lists in place of iD's for area, point and vertex (line and relation stay) */
export function withBuildingDefaults(defaults: unknown): Record<string, readonly string[]> {
  const base =
    typeof defaults === 'object' && defaults !== null
      ? (defaults as Record<string, readonly string[]>)
      : {}
  return { ...base, ...BUILDING_DEFAULTS }
}

/**
 * The favourites Maid Buildings suggests (`favourites` in the app's config): taken while the person has none, then
 * theirs to change. The types a building campaign sets most, the plain building first (for "a building, type unknown"),
 * then the residential types, the small buildings beside them, the rest, and an address point.
 */
export const BUILDING_FAVOURITES = [
  { presetId: 'building', geometry: 'area' },
  { presetId: 'building/house', geometry: 'area' },
  { presetId: 'building/detached', geometry: 'area' },
  { presetId: 'building/semidetached_house', geometry: 'area' },
  { presetId: 'building/terrace', geometry: 'area' },
  { presetId: 'building/apartments', geometry: 'area' },
  { presetId: 'building/garage', geometry: 'area' },
  { presetId: 'building/shed', geometry: 'area' },
  { presetId: 'building/commercial', geometry: 'area' },
  { presetId: 'building/industrial', geometry: 'area' },
  { presetId: 'building/roof', geometry: 'area' },
  { presetId: 'address', geometry: 'point' },
] as const
