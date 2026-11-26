/**
 * The lenses that come with the module. Plain data, like a lens file: they show what a lens looks
 * like and can be copied and changed.
 */
import type { Lens } from '@osm-editor-kit/maid-style'
import { m } from './messages.ts'

/** Warning colour for what a lens cannot show because a tag is missing */
export const WARNING = '#e6007e'

const ROADS = [
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
]
const PATHS = ['track', 'path', 'footway', 'cycleway', 'bridleway', 'pedestrian']

const PAVED = [
  'asphalt',
  'concrete',
  'concrete:plates',
  'concrete:lanes',
  'paving_stones',
  'sett',
  'cobblestone',
  'metal',
  'wood',
  'paved',
]
const UNPAVED = [
  'unpaved',
  'compacted',
  'fine_gravel',
  'gravel',
  'pebblestone',
  'dirt',
  'earth',
  'grass',
  'ground',
  'mud',
  'sand',
  'woodchips',
  'snow',
  'ice',
  'salt',
  'clay',
  'rock',
]

/** Surface: roads and paths by their surface tag */
export const surfaceLens: Lens = {
  id: 'surface',
  get name() {
    return m.lenses_surface_name()
  },
  get description() {
    return m.lenses_surface_description()
  },
  geometry: ['line'],
  rest: 'dim',
  rules: [
    {
      match: { highway: [...ROADS, ...PATHS], surface: PAVED },
      color: '#2b6cb0',
      get label() {
        return m.lenses_label_surface_paved()
      },
    },
    {
      match: { highway: [...ROADS, ...PATHS], surface: UNPAVED },
      color: '#b7791f',
      get label() {
        return m.lenses_label_surface_unpaved()
      },
    },
    {
      match: { highway: [...ROADS, ...PATHS], surface: true },
      color: '#718096',
      get label() {
        return m.lenses_label_surface_other()
      },
    },
    {
      match: { highway: [...ROADS, ...PATHS], surface: false },
      color: WARNING,
      get label() {
        return m.lenses_label_surface_missing()
      },
    },
  ],
}

/** Lit: roads and paths by their lit tag */
export const litLens: Lens = {
  id: 'lit',
  get name() {
    return m.lenses_lit_name()
  },
  get description() {
    return m.lenses_lit_description()
  },
  geometry: ['line'],
  rest: 'dim',
  rules: [
    {
      match: { highway: [...ROADS, ...PATHS], lit: ['yes', '24/7', 'automatic', 'limited'] },
      color: '#f6c700',
      get label() {
        return m.lenses_label_lit_lit()
      },
    },
    {
      match: { highway: [...ROADS, ...PATHS], lit: 'no' },
      color: '#2d3748',
      get label() {
        return m.lenses_label_lit_not_lit()
      },
    },
    {
      match: { highway: [...ROADS, ...PATHS], lit: true },
      color: '#a0aec0',
      get label() {
        return m.lenses_label_lit_other()
      },
    },
    {
      match: { highway: [...ROADS, ...PATHS], lit: false },
      color: WARNING,
      get label() {
        return m.lenses_label_lit_missing()
      },
    },
  ],
}

/**
 * Max speed: roads by bands of maxspeed. The matcher compares values, not numbers, so each band
 * lists the values it covers, in km/h and in mph (`walk` and `none` have their own bands).
 */
const SPEED_LOW = ['walk', '5', '10', '15', '20', '25', '30', '10 mph', '15 mph', '20 mph']
const SPEED_MID = ['35', '40', '45', '50', '25 mph', '30 mph']
const SPEED_HIGH = ['55', '60', '65', '70', '75', '80', '35 mph', '40 mph', '45 mph', '50 mph']
const SPEED_TOP = [
  '85',
  '90',
  '95',
  '100',
  '105',
  '110',
  '115',
  '120',
  '125',
  '130',
  '55 mph',
  '60 mph',
  '65 mph',
  '70 mph',
  '75 mph',
  '80 mph',
  'none',
]

export const maxspeedLens: Lens = {
  id: 'maxspeed',
  get name() {
    return m.lenses_maxspeed_name()
  },
  get description() {
    return m.lenses_maxspeed_description()
  },
  geometry: ['line'],
  rest: 'dim',
  rules: [
    {
      match: { highway: ROADS, maxspeed: SPEED_LOW },
      color: '#1a9850',
      get label() {
        return m.lenses_label_maxspeed_low()
      },
    },
    {
      match: { highway: ROADS, maxspeed: SPEED_MID },
      color: '#e6b800',
      get label() {
        return m.lenses_label_maxspeed_mid()
      },
    },
    {
      match: { highway: ROADS, maxspeed: SPEED_HIGH },
      color: '#f46d43',
      get label() {
        return m.lenses_label_maxspeed_high()
      },
    },
    {
      match: { highway: ROADS, maxspeed: SPEED_TOP },
      color: '#a50026',
      get label() {
        return m.lenses_label_maxspeed_top()
      },
    },
    {
      match: { highway: ROADS, maxspeed: true },
      color: '#7b61ff',
      get label() {
        return m.lenses_label_maxspeed_other()
      },
    },
    {
      match: { highway: ROADS, maxspeed: false },
      color: WARNING,
      get label() {
        return m.lenses_label_maxspeed_missing()
      },
    },
  ],
}

export const BUILT_IN_LENSES: Lens[] = [surfaceLens, litLens, maxspeedLens]
