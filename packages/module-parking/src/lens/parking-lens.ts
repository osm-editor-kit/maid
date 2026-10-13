import type { Lens } from '@osm-editor-kit/maid-style'

/**
 * The map style "Parking": roads coloured by what is parked beside them. No rules yet (the lens agent fills them).
 * The app lists it with `lenses({ lenses: [parkingLens] })` (module-lenses).
 */
export const parkingLens: Lens = {
  id: 'parking',
  name: 'Parking',
  description: 'Roads by the parking on each side.',
  geometry: ['line'],
  rest: 'dim',
  rules: [],
}
