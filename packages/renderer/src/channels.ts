// The sources the engine feeds to MapLibre, and the update channel of each: a queue of features and removals, and whether an update is in flight.
// One channel per source and tier (base, live, select); the engine sends them with its flush.
import type { Feature } from 'geojson'
import type { SourceName } from './build'

export const SOURCE_NAMES: SourceName[] = ['areas', 'lines', 'points', 'vertices']

export type Channel = {
  name: SourceName
  sourceId: string
  queue: Feature[]
  removals: string[]
  busy: boolean
  dirty: boolean
}

export function makeChannels(ids: Record<SourceName, string>) {
  const channel = (name: SourceName): Channel => ({
    name,
    sourceId: ids[name],
    queue: [],
    removals: [],
    busy: false,
    dirty: false,
  })
  return {
    areas: channel('areas'),
    lines: channel('lines'),
    points: channel('points'),
    vertices: channel('vertices'),
  }
}
