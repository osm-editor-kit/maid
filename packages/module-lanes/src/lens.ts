/**
 * The map style "Lanes": roads coloured by how much of their lanes is mapped, everything else dimmed. Values per lane
 * (turn, width, bus, bicycle, access) are green, a lane count alone is amber, a main road without any lane tag is the
 * warning pink of the lenses. Service roads and living streets without a lane tag are no gap: they stay grey.
 * Rules: the first match decides.
 */
import { matchesTags, type Lens } from '@osm-editor-kit/maid-style'
import { m } from './messages.ts'
import { LANE_ROADS, MAIN_ROADS, MINOR_ROADS, RICH_KEYS } from './roads.ts'

export const LANE_COLOURS = {
  rich: '#16a34a',
  count: '#d97706',
  missing: '#e6007e',
  minor: '#a1a1aa',
} as const

export const lanesLens: Lens = {
  id: 'lanes',
  get name() {
    return m.lens_name()
  },
  get description() {
    return m.lens_description()
  },
  // the legend names the four colours once; the rules repeat the green for every key that holds values per lane
  get legend() {
    return {
      entries: [
        { label: m.lens_rich(), color: LANE_COLOURS.rich, width: 4 },
        { label: m.lens_count(), color: LANE_COLOURS.count, width: 4 },
        { label: m.lens_missing(), color: LANE_COLOURS.missing, width: 4 },
        { label: m.lens_minor(), color: LANE_COLOURS.minor, width: 4 },
      ],
    }
  },
  geometry: ['line'],
  rest: 'dim',
  rules: [
    ...RICH_KEYS.map((key, index) => ({
      match: { highway: LANE_ROADS, [key]: true },
      color: LANE_COLOURS.rich,
      ...(index === 0
        ? {
            get label() {
              return m.lens_rich()
            },
          }
        : {}),
    })),
    {
      match: { highway: LANE_ROADS, lanes: true },
      color: LANE_COLOURS.count,
      get label() {
        return m.lens_count()
      },
    },
    { match: { highway: LANE_ROADS, 'lanes:forward': true }, color: LANE_COLOURS.count },
    {
      match: { highway: MAIN_ROADS },
      color: LANE_COLOURS.missing,
      get label() {
        return m.lens_missing()
      },
    },
    {
      match: { highway: MINOR_ROADS },
      color: LANE_COLOURS.minor,
      get label() {
        return m.lens_minor()
      },
    },
  ],
}

export type LaneStatus = keyof typeof LANE_COLOURS

const STATUS_OF_COLOUR = new Map<string, LaneStatus>(
  Object.entries(LANE_COLOURS).map(([status, colour]) => [colour, status as LaneStatus]),
)

/**
 * The colour the lens gives a road, as its name: the lens's own rules decide, so the section's status and the map
 * never disagree. Null for a way the lens does not colour.
 */
export function laneStatus(tags: Readonly<Record<string, string | undefined>>): LaneStatus | null {
  const rule = lanesLens.rules.find((candidate) =>
    matchesTags(candidate.match, tags as Record<string, string>),
  )
  return (rule?.color && STATUS_OF_COLOUR.get(rule.color)) || null
}
