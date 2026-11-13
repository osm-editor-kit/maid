/**
 * The map style "Buildings", after the building styles of Pierre-Léo Bourbonnais's iD fork (github.com/kaligrafy/iD,
 * branch v5, css/50_misc.css, and branch feat/quebec-building-styles, lenses/v5-quebec.css, 2026-07). That fork is
 * used for building mapping campaigns in Québec. Its idea:
 * - every building is outlined and filled in a salmon red, so buildings stand out on the aerial imagery;
 * - the building type changes the outline (and for the non-residential types the fill): commercial and retail blue,
 *   office crimson, public and civic orange, farm buildings yellow, service teal, industrial violet, and the
 *   residential types each in their own colour (house dark red, detached orange, semi-detached mint, terrace green,
 *   apartments olive);
 * - a building with a number of dwellings (`building:flats`, `flats` or `houses`) gets a thicker outline in a colour
 *   ramp from 1 (cyan) to 8 (orange), more than 8 in red. The number wins over the type, as in the fork's CSS (the
 *   flats classes are more specific than the type classes). `FlatsOnMap` writes the number on the building, as the
 *   fork's labels do for buildings without a name.
 * Rules: the first match decides. Everything else is drawn as usual (`rest: 'normal'`), so roads and paths stay
 * readable as context.
 */
import type { Lens, LensRule } from '@osm-editor-kit/maid-style'
import { FLATS_KEYS } from './flats.ts'
import { m } from './messages.ts'

/** The fork's colours, as hex (the fork writes them as rgb()) */
export const BUILDING_COLOURS = {
  /** Every building: `path.stroke.tag-building`, fill at 30 % */
  building: '#e06e5f',
  commercial: '#001aff',
  /** The outline is crimson, the fill a lighter red (two colours in the fork) */
  office: '#ce0041',
  officeFill: '#ff0051',
  public: '#ff5900',
  farm: '#ffc44f',
  /** The outline is teal, the fill a darker teal (two colours in the fork) */
  service: '#4b8c96',
  serviceFill: '#24616a',
  industrial: '#b700ff',
  house: '#9c2424',
  detached: '#e9993d',
  semidetached: '#55d398',
  terrace: '#72d355',
  apartments: '#c0d355',
  /** More than 8 dwellings, or a number the ramp has no colour for */
  flatsMany: '#e20000',
} as const

/** The colours of 1 to 8 dwellings, from cyan to orange (`tag-flats-1` to `tag-flats-8`) */
export const FLATS_RAMP = [
  '#00ccff',
  '#00ffea',
  '#00ff9d',
  '#00ff15',
  '#b3ff00',
  '#ffd900',
  '#ffb900',
  '#ffa600',
] as const

/** The outline width of a building with a number of dwellings (the fork's `stroke-width: 2`) */
const FLATS_WIDTH = 2.5
/** The fork fills its buildings at 30 % (iD's partial fill); Maid fills the whole area at the same alpha */
const FILL = 0.3

/** A building of these types, in its colours; with `fill` the fill differs from the outline */
function type(values: string | string[], color: string, fillColor?: string): LensRule {
  return { match: { building: values }, color, fillColor: fillColor ?? color, fillOpacity: FILL }
}

/** One rule per key and number: `building:flats` first, then `flats`, then `houses` */
function flatsRules(): LensRule[] {
  const rules: LensRule[] = []
  for (const key of FLATS_KEYS) {
    // 0 is no dwelling: the building keeps its type's look (the fork checks `v > 0`)
    rules.push(...typeRules().map((rule) => ({ ...rule, match: { ...rule.match, [key]: '0' } })))
    FLATS_RAMP.forEach((color, index) => {
      rules.push({
        match: { building: true, [key]: String(index + 1) },
        color,
        width: FLATS_WIDTH,
        fillColor: BUILDING_COLOURS.building,
        fillOpacity: FILL,
      })
    })
    rules.push({
      match: { building: true, [key]: true },
      color: BUILDING_COLOURS.flatsMany,
      width: FLATS_WIDTH,
      fillColor: BUILDING_COLOURS.building,
      fillOpacity: FILL,
    })
  }
  return rules
}

/** The building types, then any other building */
function typeRules(): LensRule[] {
  return [
    type(['commercial', 'retail'], BUILDING_COLOURS.commercial),
    type('office', BUILDING_COLOURS.office, BUILDING_COLOURS.officeFill),
    // the fork also marks `office=yes` on a building of another type (`tag-building-office-yes`)
    {
      match: { building: true, office: 'yes' },
      color: BUILDING_COLOURS.office,
      fillColor: BUILDING_COLOURS.officeFill,
      fillOpacity: FILL,
    },
    type(['public', 'civic', 'pavilion'], BUILDING_COLOURS.public),
    type(['farm_auxiliary', 'barn'], BUILDING_COLOURS.farm),
    type('service', BUILDING_COLOURS.service, BUILDING_COLOURS.serviceFill),
    type('industrial', BUILDING_COLOURS.industrial),
    // the residential types change the outline only, the fill stays the buildings' salmon
    type('house', BUILDING_COLOURS.house, BUILDING_COLOURS.building),
    type('detached', BUILDING_COLOURS.detached, BUILDING_COLOURS.building),
    type('semidetached_house', BUILDING_COLOURS.semidetached, BUILDING_COLOURS.building),
    type('terrace', BUILDING_COLOURS.terrace, BUILDING_COLOURS.building),
    type('apartments', BUILDING_COLOURS.apartments, BUILDING_COLOURS.building),
    { match: { building: true }, color: BUILDING_COLOURS.building, fillOpacity: FILL },
  ]
}

export const buildingsLens: Lens = {
  id: 'buildings',
  get name() {
    return m.lens_name()
  },
  get description() {
    return m.lens_description()
  },
  get legend() {
    return {
      entries: [
        { label: m.lens_building(), color: BUILDING_COLOURS.building, width: 8 },
        { label: m.lens_house(), color: BUILDING_COLOURS.house, width: 3 },
        { label: m.lens_detached(), color: BUILDING_COLOURS.detached, width: 3 },
        { label: m.lens_semidetached(), color: BUILDING_COLOURS.semidetached, width: 3 },
        { label: m.lens_terrace(), color: BUILDING_COLOURS.terrace, width: 3 },
        { label: m.lens_apartments(), color: BUILDING_COLOURS.apartments, width: 3 },
        { label: m.lens_commercial(), color: BUILDING_COLOURS.commercial, width: 8 },
        { label: m.lens_office(), color: BUILDING_COLOURS.office, width: 8 },
        { label: m.lens_public(), color: BUILDING_COLOURS.public, width: 8 },
        { label: m.lens_farm(), color: BUILDING_COLOURS.farm, width: 8 },
        { label: m.lens_service(), color: BUILDING_COLOURS.service, width: 8 },
        { label: m.lens_industrial(), color: BUILDING_COLOURS.industrial, width: 8 },
        { label: m.lens_flats_few(), color: FLATS_RAMP[0], width: 4 },
        { label: m.lens_flats_some(), color: FLATS_RAMP[3], width: 4 },
        { label: m.lens_flats_eight(), color: FLATS_RAMP[7], width: 4 },
        { label: m.lens_flats_many(), color: BUILDING_COLOURS.flatsMany, width: 4 },
      ],
      note: m.lens_note(),
    }
  },
  rest: 'normal',
  // buildings are areas; a building mapped as a point keeps its pin
  geometry: ['area'],
  rules: [
    // building=no is not a building (the fork checks `building !== 'no'`)
    { match: { building: 'no' } },
    ...flatsRules(),
    ...typeRules(),
  ],
}
