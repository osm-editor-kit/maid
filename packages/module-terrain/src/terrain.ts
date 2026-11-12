/**
 * The terrain's data: the elevation tiles, the URL parameter and the state of the panel. Pure, no React and no map.
 *
 * Elevation comes from Mapterhorn (mapterhorn.com): Terrarium-encoded WebP tiles of 512 px, zoom 0 to 15, one global
 * composite of 153 national and global sources. The editor layer index (ELI, the imagery list) has no source that
 * gives heights: its elevation rows are shaded-relief, slope and contour images, which MapLibre cannot use for
 * `raster-dem`, hillshade or 3D (docs/research/climbing.md, "Terrain"). So Mapterhorn is the one source here, and the
 * panel says that its sources are not all known to be compatible with OSM.
 */
import type { UrlParser } from '@osm-editor-kit/maid-core'
import { create } from 'zustand'

/** Mapterhorn's tiles, as its README and viewer give them (tiles.mapterhorn.com, Terrarium, 512 px, maxzoom 15) */
export const MAPTERHORN = {
  tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
  tileSize: 512,
  maxzoom: 15,
  encoding: 'terrarium' as const,
  attribution:
    '<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noreferrer">© Mapterhorn</a>',
  attributionUrl: 'https://mapterhorn.com/attribution/',
}

/** What the map shows of the terrain: nothing, a relief shading under the data, or the relief and the ground in 3D */
export type TerrainMode = 'off' | 'relief' | '3d'

/** The heights in 3D: 1 is true scale; steep rock reads better a little raised */
export const EXAGGERATIONS = [1, 1.5, 2] as const
export type Exaggeration = (typeof EXAGGERATIONS)[number]

/** The tilt the 3D view starts with, in degrees */
export const START_PITCH = 55

/** How far the map may tilt: MapLibre's default. Above it the OSM tiles to load grow fast (rotate-and-tilt.md: 6.5 times at zoom 16, pitch 60) */
export const MAX_PITCH = 60

/**
 * `terrain`: `relief` or `3d`. Absent is off. Maid's own name (iD has no terrain); kept in a link so that its reader
 * sees the rock as its author did. The tilt is in `map=`'s fifth number.
 */
export const parseAsTerrain: UrlParser<TerrainMode> = {
  parse: (value) => (value === 'relief' || value === '3d' ? value : null),
  serialize: (value) => value,
  eq: (a, b) => a === b,
}

type TerrainState = {
  exaggeration: Exaggeration
  setExaggeration: (exaggeration: Exaggeration) => void
}

/** The height scale of the 3D view. The mode itself lives in the URL (`terrain`), the one place both the panel and the map read. */
export const useTerrain = create<TerrainState>((set) => ({
  exaggeration: 1.5,
  setExaggeration: (exaggeration) => set({ exaggeration }),
}))
