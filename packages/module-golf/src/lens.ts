/**
 * The map style "Golf": the parts of a course in the colours a golfer knows from a yardage book, everything else dimmed.
 * Areas get the colour as a fill (the lens fill alpha) and as the outline; the holes are red lines, amber while they lack
 * their number or par, so a course that still needs its scorecard data stands out. Rules: the first match decides.
 */
import type { Lens } from '@osm-editor-kit/maid-style'
import { m } from './messages.ts'

export const GOLF_COLOURS = {
  green: '#16a34a',
  fairway: '#84cc16',
  rough: '#4d7c0f',
  tee: '#0d9488',
  bunker: '#eab308',
  water: '#2563eb',
  lateral: '#0891b2',
  hole: '#dc2626',
  holeOpen: '#d97706',
  pin: '#dc2626',
  path: '#78716c',
  range: '#a3e635',
  course: '#15803d',
  clubhouse: '#9333ea',
} as const

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
        { label: m.lens_green(), color: GOLF_COLOURS.green, width: 6 },
        { label: m.lens_fairway(), color: GOLF_COLOURS.fairway, width: 6 },
        { label: m.lens_rough(), color: GOLF_COLOURS.rough, width: 6 },
        { label: m.lens_tee(), color: GOLF_COLOURS.tee, width: 6 },
        { label: m.lens_bunker(), color: GOLF_COLOURS.bunker, width: 6 },
        { label: m.lens_water(), color: GOLF_COLOURS.water, width: 6 },
        { label: m.lens_lateral(), color: GOLF_COLOURS.lateral, width: 6 },
        { label: m.lens_hole(), color: GOLF_COLOURS.hole, width: 3, dash: [6, 3] },
        { label: m.lens_hole_open(), color: GOLF_COLOURS.holeOpen, width: 3, dash: [6, 3] },
        { label: m.lens_path(), color: GOLF_COLOURS.path, width: 3 },
        { label: m.lens_course(), color: GOLF_COLOURS.course, width: 2 },
      ],
    }
  },
  rest: 'dim',
  rules: [
    {
      match: { golf: 'hole', ref: true, par: true },
      color: GOLF_COLOURS.hole,
      width: 3,
      dash: [6, 3],
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
    { match: { golf: 'green' }, color: GOLF_COLOURS.green, label: 'golf=green' },
    { match: { golf: 'fairway' }, color: GOLF_COLOURS.fairway, label: 'golf=fairway' },
    { match: { golf: 'rough' }, color: GOLF_COLOURS.rough, label: 'golf=rough' },
    { match: { golf: 'tee' }, color: GOLF_COLOURS.tee, label: 'golf=tee' },
    { match: { golf: 'bunker' }, color: GOLF_COLOURS.bunker, label: 'golf=bunker' },
    { match: { golf: 'water_hazard' }, color: GOLF_COLOURS.water, label: 'golf=water_hazard' },
    {
      match: { golf: 'lateral_water_hazard' },
      color: GOLF_COLOURS.lateral,
      label: 'golf=lateral_water_hazard',
    },
    { match: { golf: ['cartpath', 'path'] }, color: GOLF_COLOURS.path, width: 3 },
    { match: { golf: 'driving_range' }, color: GOLF_COLOURS.range, label: 'golf=driving_range' },
    { match: { golf: 'clubhouse' }, color: GOLF_COLOURS.clubhouse, label: 'golf=clubhouse' },
    { match: { leisure: 'golf_course' }, color: GOLF_COLOURS.course, width: 2, opacity: 0.5 },
  ],
}
