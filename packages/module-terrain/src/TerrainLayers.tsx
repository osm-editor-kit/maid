import { isAutomated, type UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useEffect } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/maplibre'
import { MAPTERHORN, START_PITCH, type TerrainMode, useTerrain } from './terrain.ts'

/** Two sources of the same tiles: MapLibre draws a worse relief when the hillshade shares the 3D ground's source */
const RELIEF_SOURCE = 'maid-terrain-relief'
const GROUND_SOURCE = 'maid-terrain-ground'

/** The mode the URL shows (`terrain`), and its setter: the panel writes it, the map reads it */
export function useTerrainMode(handle: UrlParamHandle<TerrainMode>) {
  const [value, setValue] = useUrlParam(handle)
  const mode: TerrainMode = value ?? 'off'
  const setMode = (next: TerrainMode) => void setValue(next === 'off' ? null : next)
  return [mode, setMode] as const
}

/**
 * The relief under the OSM data and, in 3D, the ground itself. Nothing is drawn or requested under automation (core
 * rule 1: the benchmark browser blocks other hosts; the panel says so).
 *
 * `setTerrain` and `easeTo` are imperative MapLibre calls: react-map-gl's `terrain` prop belongs to the shell's <Map>,
 * which a module does not touch, and the tilt is a move of the camera, not a setting.
 */
export function TerrainLayers({
  belowOsm,
  handle,
}: MapContentProps & { handle: UrlParamHandle<TerrainMode> }) {
  const { current: map } = useMap()
  const [mode] = useTerrainMode(handle)
  const exaggeration = useTerrain((state) => state.exaggeration)
  const shown = mode !== 'off' && !isAutomated()
  const ground = shown && mode === '3d'

  useEffect(() => {
    const maplibre = map?.getMap()
    if (!maplibre) return
    if (!ground) {
      maplibre.setTerrain(null)
      if (maplibre.getPitch() > 0) maplibre.easeTo({ pitch: 0 })
      return
    }
    // Only once the map has loaded: terrain set before MapLibre's `load` holds that event back until the heights have
    // come, and the editor attaches to the map (and loads the OSM data) on `load`. The source is added by <Source> in
    // the same commit, so it may also be missing for a moment.
    let cancelled = false
    const apply = () => {
      if (cancelled) return
      if (!maplibre.loaded() || !maplibre.getSource(GROUND_SOURCE)) {
        maplibre.once('idle', apply)
        return
      }
      maplibre.setTerrain({ source: GROUND_SOURCE, exaggeration })
    }
    apply()
    return () => {
      cancelled = true
    }
  }, [map, ground, exaggeration])

  // entering 3D tilts the map once, so that the rock stands up; leaving it lays the map flat (above)
  useEffect(() => {
    const maplibre = map?.getMap()
    if (ground && maplibre && maplibre.getPitch() === 0)
      maplibre.easeTo({ pitch: START_PITCH, duration: 800 })
  }, [map, ground])

  if (!shown) return null
  const spec = {
    type: 'raster-dem' as const,
    tiles: MAPTERHORN.tiles,
    tileSize: MAPTERHORN.tileSize,
    maxzoom: MAPTERHORN.maxzoom,
    encoding: MAPTERHORN.encoding,
  }
  return (
    <>
      <Source id={RELIEF_SOURCE} {...spec} attribution={MAPTERHORN.attribution} />
      <Layer
        id="maid-terrain-hillshade"
        type="hillshade"
        source={RELIEF_SOURCE}
        beforeId={belowOsm}
        paint={{
          'hillshade-exaggeration': 0.55,
          'hillshade-shadow-color': '#3f3a36',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#5b4f45',
        }}
      />
      {ground && <Source id={GROUND_SOURCE} {...spec} />}
    </>
  )
}
