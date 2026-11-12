/**
 * The golf presets: the tagging schema's golf presets with a companion tag, presets and fields the schema does not have,
 * and the presets offered first in the type picker (iD's defaults per geometry). The name of the replaced schema preset
 * stays English in the change; its translations come from the schema as before.
 *
 * Checked against the OSM wiki (Key:golf, Tag:golf=*, Tag:leisure=golf_course, Key:golf:course; PDFs of 2026-11-12):
 * - golf/bunker adds `surface=sand` (the wiki's useful combination). The water hazards add `natural=water` in the
 *   schema already. No `landuse=grass` on fairway, green, tee or rough: OSM Carto draws golf=* itself since 5.4.
 * - golf/pin: the flag on the green, a point or the last node of the hole. golf/out_of_bounds: a line along the white
 *   stakes (proposed). Neither is in id-tagging-schema 7.3.
 * - Fields: `golf:course` (9_hole, 18_hole, …) and `golf:par` on the course, `golf:course:name` on a hole.
 */
import type { PresetChanges } from '@osm-editor-kit/maid-presets'
import { m } from './messages.ts'

export const golfPresetChanges: PresetChanges = {
  fields: {
    golf_course_holes: {
      type: 'combo',
      key: 'golf:course',
      get label() {
        return m.field_course_holes()
      },
      options: {
        '9_hole': '9 holes',
        '18_hole': '18 holes',
        '27_hole': '27 holes',
        pitch_and_putt: 'Pitch and putt',
        driving_range: 'Driving range only',
      },
    },
    golf_par: {
      type: 'number',
      key: 'golf:par',
      get label() {
        return m.field_course_par()
      },
      minValue: 1,
    },
    golf_course_name: {
      type: 'text',
      key: 'golf:course:name',
      get label() {
        return m.field_course_name()
      },
    },
  },
  presets: {
    // the wiki's "useful combination" for a bunker is surface=sand; natural=sand is disputed (a bunker is not natural)
    'golf/bunker': {
      name: 'Sand Trap',
      tags: { golf: 'bunker' },
      addTags: { golf: 'bunker', surface: 'sand' },
      geometry: ['area'],
      icon: 'maki-golf',
      fields: ['surface'],
      terms: ['bunker', 'sand', 'hazard'],
    },
    'golf/pin': {
      get name() {
        return m.preset_pin()
      },
      tags: { golf: 'pin' },
      geometry: ['point', 'vertex'],
      icon: 'maki-golf',
      fields: ['ref_golf_hole'],
      terms: ['flag', 'hole', 'cup', 'pin'],
    },
    'golf/out_of_bounds': {
      get name() {
        return m.preset_out_of_bounds()
      },
      tags: { golf: 'out_of_bounds' },
      geometry: ['line'],
      icon: 'maki-golf',
      fields: ['ref_golf_hole'],
      terms: ['out of bounds', 'OB', 'white stakes', 'boundary'],
    },
  },
  presetEdits: {
    // the course's holes and par, as the wiki's golf:course and golf:par (a facility with one course)
    'leisure/golf_course': { addFields: ['golf_course_holes', 'golf_par'] },
    // the course a hole belongs to, where a facility has several (wiki: golf:course:name on the hole)
    'golf/hole': { addMoreFields: ['golf_course_name', 'name'] },
  },
}

/**
 * What the type picker lists before anything is typed, per geometry: the course's parts first, then the generic
 * feature. iD's own defaults (shops, roads, …) are left out: on a golf course they are noise.
 */
export const GOLF_DEFAULTS = {
  area: [
    'golf/green',
    'golf/fairway',
    'golf/tee',
    'golf/bunker',
    'golf/rough',
    'golf/water_hazard',
    'golf/lateral_water_hazard',
    'golf/driving_range',
    'golf/clubhouse',
    'leisure/golf_course',
    'area',
  ],
  line: ['golf/hole', 'golf/cartpath', 'golf/path', 'golf/out_of_bounds', 'line'],
  point: ['golf/pin', 'golf/clubhouse', 'leisure/golf_course', 'point'],
  vertex: ['golf/tee', 'golf/pin', 'point'],
} as const

/** The schema's defaults with the golf lists in place of iD's for area, line, point and vertex (relations stay) */
export function withGolfDefaults(defaults: unknown): Record<string, readonly string[]> {
  const base =
    typeof defaults === 'object' && defaults !== null
      ? (defaults as Record<string, readonly string[]>)
      : {}
  return { ...base, ...GOLF_DEFAULTS }
}

/**
 * The favourites Maid Golf suggests (`favourites` in the app's config): taken while the person has none, then theirs to
 * change. The parts a mapper draws for every hole, in the order of tracing: hole, tee, fairway, green, pin, bunker,
 * rough, water.
 */
export const GOLF_FAVOURITES = [
  { presetId: 'golf/hole', geometry: 'line' },
  { presetId: 'golf/tee', geometry: 'area' },
  { presetId: 'golf/fairway', geometry: 'area' },
  { presetId: 'golf/green', geometry: 'area' },
  { presetId: 'golf/pin', geometry: 'point' },
  { presetId: 'golf/bunker', geometry: 'area' },
  { presetId: 'golf/rough', geometry: 'area' },
  { presetId: 'golf/water_hazard', geometry: 'area' },
] as const
