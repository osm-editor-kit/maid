/**
 * The map style "Golf", after OSM Carto 5.4, where jgruca brought the golf details into the standard map (diary
 * 397731, 2021): tees, fairways, rough and the driving range in the grass colour, the green in the pitch colour with a
 * darker outline (a comment there: without it the green reads like water), bunkers in the sand colour, the holes as thin
 * grey lines with their number (`HoleNumbersOnMap`), the course in the campsite colour. Maid fills the areas at 60 %
 * instead of Carto's solid fills, so the aerial imagery a mapper traces from still shows through; the rough is a little
 * darker than the grass instead of Carto's pattern. Holes without number or par are amber. Rules: the first match decides.
 */
import type { Lens } from '@osm-editor-kit/maid-style'
import { m } from './messages.ts'

export const GOLF_COLOURS = {
  /** Carto's leisure=pitch, for golf=green; the outline is darker so the green does not read like water */
  green: '#88e0be',
  greenOutline: '#4c9c7e',
  /** Carto's landuse=grass, for tee, fairway and driving range */
  grass: '#cdebb0',
  grassOutline: '#8fbf6a',
  /** Carto draws the rough as grass with a pattern; Maid draws it a shade darker */
  rough: '#b5d99a',
  /** Carto's natural=sand */
  bunker: '#f5e9c6',
  bunkerOutline: '#d6b86b',
  /** Carto's water */
  water: '#aad3df',
  waterOutline: '#5d9fc0',
  /** The line of play, thin and grey as in Carto, amber while it lacks number or par */
  hole: '#666666',
  holeOpen: '#d97706',
  pin: '#c0392b',
  path: '#a39b8f',
  outOfBounds: '#f8fafc',
  /** Carto's campsite colour, which leisure=golf_course got in 5.4 */
  course: '#def6c0',
  courseOutline: '#7fb25a',
  clubhouse: '#d9d0c9',
  clubhouseOutline: '#b1a59a',
} as const

/** Areas fill at this alpha: map-like, with the imagery still visible below */
const FILL = 0.6

const area = (match: Record<string, string>, color: string, fillColor: string, label?: string) => ({
  match,
  color,
  fillColor,
  fillOpacity: FILL,
  width: 1.5,
  ...(label ? { label } : {}),
})

export const golfLens: Lens = {
  id: 'golf',
  get name() {
    return m.lens_name()
  },
  get description() {
    return m.lens_description()
  },
  get legend() {
    return {
      entries: [
        { label: m.lens_green(), color: GOLF_COLOURS.green, width: 8 },
        {
          label: `${m.lens_fairway()}, ${m.lens_tee()}, ${m.lens_range()}`,
          color: GOLF_COLOURS.grass,
          width: 8,
        },
        { label: m.lens_rough(), color: GOLF_COLOURS.rough, width: 8 },
        { label: m.lens_bunker(), color: GOLF_COLOURS.bunker, width: 8 },
        { label: `${m.lens_water()}, ${m.lens_lateral()}`, color: GOLF_COLOURS.water, width: 8 },
        { label: m.lens_hole(), color: GOLF_COLOURS.hole, width: 1.5 },
        { label: m.lens_hole_open(), color: GOLF_COLOURS.holeOpen, width: 3, dash: [6, 3] },
        { label: m.lens_out_of_bounds(), color: '#94a3b8', width: 2, dash: [4, 4] },
        { label: m.lens_path(), color: GOLF_COLOURS.path, width: 3 },
        { label: m.lens_course(), color: GOLF_COLOURS.course, width: 8 },
      ],
      note: m.lens_note(),
    }
  },
  rest: 'normal',
  rules: [
    {
      match: { golf: 'hole', ref: true, par: true },
      color: GOLF_COLOURS.hole,
      width: 1.5,
      get label() {
        return m.lens_hole()
      },
    },
    {
      match: { golf: 'hole' },
      color: GOLF_COLOURS.holeOpen,
      width: 3,
      dash: [6, 3],
      get label() {
        return m.lens_hole_open()
      },
    },
    { match: { golf: 'pin' }, color: GOLF_COLOURS.pin, label: 'golf=pin' },
    {
      match: { golf: 'out_of_bounds' },
      color: '#94a3b8',
      width: 2,
      dash: [4, 4],
      label: 'golf=out_of_bounds',
    },
    area({ golf: 'green' }, GOLF_COLOURS.greenOutline, GOLF_COLOURS.green, 'golf=green'),
    area({ golf: 'fairway' }, GOLF_COLOURS.grassOutline, GOLF_COLOURS.grass, 'golf=fairway'),
    area({ golf: 'tee' }, GOLF_COLOURS.grassOutline, GOLF_COLOURS.grass, 'golf=tee'),
    area(
      { golf: 'driving_range' },
      GOLF_COLOURS.grassOutline,
      GOLF_COLOURS.grass,
      'golf=driving_range',
    ),
    area({ golf: 'rough' }, GOLF_COLOURS.grassOutline, GOLF_COLOURS.rough, 'golf=rough'),
    area({ golf: 'bunker' }, GOLF_COLOURS.bunkerOutline, GOLF_COLOURS.bunker, 'golf=bunker'),
    area(
      { golf: 'water_hazard' },
      GOLF_COLOURS.waterOutline,
      GOLF_COLOURS.water,
      'golf=water_hazard',
    ),
    area(
      { golf: 'lateral_water_hazard' },
      GOLF_COLOURS.waterOutline,
      GOLF_COLOURS.water,
      'golf=lateral_water_hazard',
    ),
    area(
      { golf: 'clubhouse' },
      GOLF_COLOURS.clubhouseOutline,
      GOLF_COLOURS.clubhouse,
      'golf=clubhouse',
    ),
    { match: { golf: ['cartpath', 'path'] }, color: GOLF_COLOURS.path, width: 3 },
    {
      match: { leisure: 'golf_course' },
      color: GOLF_COLOURS.courseOutline,
      fillColor: GOLF_COLOURS.course,
      fillOpacity: 0.45,
      width: 2,
      label: 'leisure=golf_course',
    },
  ],
}
