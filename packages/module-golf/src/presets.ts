/**
 * The golf presets: the tagging schema's golf presets with the companion tags most maps need, a pin preset the schema
 * does not have, and the presets offered first in the type picker (iD's defaults per geometry). The names of the
 * replaced schema presets stay English in the change; their translations come from the schema as before.
 *
 * - golf/bunker adds `natural=sand`, golf/water_hazard and golf/lateral_water_hazard add `natural=water`: renderers
 *   (OSM Carto among them) draw the sand and the water from the natural tag, not from golf=*.
 * - golf/pin: the flag on the green, a point. Not in id-tagging-schema 7.3.
 */
import type { PresetChanges } from '@osm-editor-kit/maid-presets'
import { m } from './messages.ts'

export const golfPresetChanges: PresetChanges = {
  presets: {
    'golf/bunker': {
      name: 'Sand Trap',
      tags: { golf: 'bunker' },
      addTags: { golf: 'bunker', natural: 'sand' },
      geometry: ['area'],
      icon: 'maki-golf',
      fields: ['surface'],
      terms: ['bunker', 'sand', 'hazard'],
    },
    'golf/water_hazard': {
      name: 'Standing Water Hazard',
      tags: { golf: 'water_hazard' },
      addTags: { golf: 'water_hazard', natural: 'water' },
      geometry: ['area'],
      icon: 'maki-golf',
      terms: ['pond', 'lake', 'water'],
    },
    'golf/lateral_water_hazard': {
      name: 'Lateral Water Hazard',
      tags: { golf: 'lateral_water_hazard' },
      addTags: { golf: 'lateral_water_hazard', natural: 'water' },
      geometry: ['area'],
      icon: 'maki-golf',
      terms: ['pond', 'stream', 'water'],
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
    'leisure/golf_course',
    'golf/clubhouse',
    'area',
  ],
  line: ['golf/hole', 'golf/cartpath', 'golf/path', 'line'],
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
