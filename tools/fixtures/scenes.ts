/**
 * Scenes are frozen cut-outs of OSM data that every editor loads from the mock API.
 * `bbox` is [west, south, east, north]. `center` is where scenarios start.
 */
export type Scene = {
  name: string
  description: string
  bbox: [number, number, number, number]
  center: [number, number]
  /** OSM zoom at which scenarios start. Chosen so that the viewport stays inside the data. */
  zoom: number
}

export const SCENES: Scene[] = [
  {
    name: 'small',
    description: 'Residential streets in Lichtenrade',
    bbox: [13.393, 52.385, 13.407, 52.393],
    center: [13.4, 52.389],
    zoom: 18,
  },
  {
    name: 'medium',
    description: 'Inner city around Hackescher Markt, Mitte',
    bbox: [13.39, 52.516, 13.415, 52.53],
    center: [13.4023, 52.5228],
    zoom: 17,
  },
  {
    name: 'dense',
    description: 'Neukölln with detailed street-space and parking mapping',
    bbox: [13.418, 52.476, 13.448, 52.493],
    center: [13.433, 52.4845],
    zoom: 17,
  },
]

export function getScene(name: string) {
  const scene = SCENES.find((s) => s.name === name)
  if (!scene) throw new Error(`Unknown scene "${name}". Known: ${SCENES.map((s) => s.name).join(', ')}`)
  return scene
}
