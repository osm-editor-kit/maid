import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, RasterSourceSpecification, StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { Map, type MapRef } from 'react-map-gl/maplibre'
import { useMeasure } from '../shell-context'
import {
  crossPath,
  FINGER_REACH,
  LOUPE_RADIUS,
  LOUPE_SIZE,
  loupeCenter,
  loupeTape,
  loupeZoom,
  type LoupeOptions,
  type Vec,
} from './measure-loupe'

/**
 * The magnifier of the measuring tool (the Radnetz fork's measure_loupe.ts, ported): a round lens of
 * 160 px that shows the background imagery 3 times larger, centred on the point a click would set.
 * Its crosshair marks that point, and the tape from the first click runs to it in the lens.
 *
 * How the lens gets its picture: a second, non-interactive MapLibre map inside the lens, with only the
 * active background's raster source (the imagery module's `backgroundSource`, see imagery-used.ts). Its
 * camera is `jumpTo`'d to the pointer at the main map's zoom plus log2(3), so MapLibre asks for tiles
 * one or two levels deeper, which is sharper, and past the source's maxzoom it overzooms. The OSM data
 * is not in that style, so the lines of the data never cover what is clicked. The other option, copying
 * a region of the main map's canvas, would need `preserveDrawingBuffer` or a read in the render frame, it
 * would show the OSM lines too, and it would be blurred by the 3x scaling; so it is not used.
 *
 * Only while measuring: the map is created with the measure and destroyed with it (the second WebGL
 * context exists only then). Without a raster background the parent does not mount this at all; with
 * `?loupe=blank` (the browser check) it is mounted with an empty style, which asks for no tile.
 *
 * `jumpTo` is called through the map ref on each animation frame: react-map-gl has no prop for a camera
 * that changes on every pointer move without a render per move, and a render per move would also
 * re-run the main map's props.
 */

/** A finger covers more of the map than a pointer: the lens sits above it, further away */
const TOUCH: LoupeOptions = { up: true, reach: FINGER_REACH }
const MARK = { stroke: '#2f6bff', halo: '#fff', dot: '#ff2f6b' }
const CROSS = crossPath()

type View = { zoom: number; bearing: number; size: Vec }

function viewOf(map: MapLibreMap): View {
  const box = map.getContainer()
  return {
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    size: [box.clientWidth, box.clientHeight],
  }
}

/**
 * The main map's zoom, bearing and size, as state: a new value on each move, so the lens follows. The loupe is
 * a child of the main map, which has no prop for these events in this component, so it listens to the map here.
 */
function useMapView(map: MapLibreMap) {
  const [view, setView] = useState(() => viewOf(map))
  useEffect(() => {
    const onMove = () => setView(viewOf(map))
    map.on('move', onMove)
    map.on('resize', onMove)
    return () => {
      map.off('move', onMove)
      map.off('resize', onMove)
    }
  }, [map])
  return view
}

/** The lens's top-left corner on the map, and the tape in the lens; undefined before the pointer is over the map */
function placeOn(
  map: MapLibreMap,
  start: [number, number] | undefined,
  pointer: { lon: number; lat: number; touch: boolean } | undefined,
  view: View,
) {
  if (!pointer) return undefined
  const at = map.project([pointer.lon, pointer.lat])
  const handle: Vec = [at.x, at.y]
  const other = start ? map.project(start) : undefined
  const otherAt: Vec = other ? [other.x, other.y] : handle
  const [cx, cy] = loupeCenter(handle, otherAt, view.size, LOUPE_RADIUS, pointer.touch ? TOUCH : {})
  return {
    left: cx - LOUPE_RADIUS,
    top: cy - LOUPE_RADIUS,
    tape: other ? loupeTape(handle, otherAt) : undefined,
  }
}

/** The lens's style: the background colour, and the raster source when there is one */
function lensStyle(
  source: RasterSourceSpecification | undefined,
  brightness: number,
): StyleSpecification {
  const base = {
    id: 'background',
    type: 'background' as const,
    paint: { 'background-color': '#222' },
  }
  if (!source) return { version: 8, sources: {}, layers: [base] }
  return {
    version: 8,
    sources: { imagery: source },
    layers: [
      base,
      {
        id: 'imagery',
        type: 'raster',
        source: 'imagery',
        paint: { 'raster-brightness-max': brightness },
      },
    ],
  }
}

export function MeasureLoupe(props: {
  /** The main map: the lens follows its zoom, bearing and size */
  map: MapLibreMap
  /** The background as a raster source (the imagery module's), or none for an empty lens */
  source?: RasterSourceSpecification
  brightness: number
}) {
  const { map, source, brightness } = props
  // the first click and the pointer: read again on each move of the measure (shell-context useMeasure)
  const spots = useMeasure((engine) => engine.measureSpots)
  const view = useMapView(map)
  // the lens's map starts where the main map is (its tiles are loaded already); the first move puts it on the pointer
  const [start] = useState(() => {
    const centre = map.getCenter()
    return { longitude: centre.lng, latitude: centre.lat, zoom: loupeZoom(map.getZoom()) }
  })
  const lens = useRef<MapRef>(null)
  const style = lensStyle(source, brightness)
  const placed = placeOn(map, spots.start, spots.pointer, view)
  const lon = spots.pointer?.lon
  const lat = spots.pointer?.lat

  // the lens's camera: on the pointer, deeper by log2(3) than the main map, one move per animation frame
  useEffect(() => {
    const target = lens.current
    if (lon === undefined || lat === undefined || !target) return
    const frame = requestAnimationFrame(() => {
      target.jumpTo({ center: [lon, lat], zoom: loupeZoom(view.zoom), bearing: view.bearing })
    })
    return () => cancelAnimationFrame(frame)
  }, [lon, lat, view])

  const R = LOUPE_RADIUS
  return (
    <div
      role="img"
      data-testid="measure-loupe"
      aria-label="Magnifier of the measure: the background, three times larger"
      className={`pointer-events-none absolute isolate z-20 h-[160px] w-[160px] overflow-hidden rounded-full bg-zinc-800 shadow-[0_0_0_3px_#fff,0_0_0_4px_#000,0_2px_10px_4px_rgb(0_0_0/0.5)] ${placed ? '' : 'invisible'}`}
      style={{ left: placed?.left ?? 0, top: placed?.top ?? 0 }}
    >
      <Map
        ref={lens}
        id="measureLoupe"
        mapLib={maplibregl}
        initialViewState={start}
        mapStyle={style}
        interactive={false}
        attributionControl={false}
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        width={LOUPE_SIZE}
        height={LOUPE_SIZE}
        viewBox={`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`}
      >
        {placed?.tape && (
          <line
            data-testid="measure-loupe-tape"
            x1={placed.tape.x1}
            y1={placed.tape.y1}
            x2={placed.tape.x2}
            y2={placed.tape.y2}
            stroke={MARK.stroke}
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.9}
          />
        )}
        {/* a crosshair with a gap, so that the measured point itself stays visible */}
        <path
          data-testid="measure-loupe-cross-halo"
          d={CROSS}
          fill="none"
          stroke={MARK.halo}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path
          data-testid="measure-loupe-cross"
          d={CROSS}
          fill="none"
          stroke={MARK.stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle
          data-testid="measure-loupe-dot"
          cx={R}
          cy={R}
          r={1.5}
          fill={MARK.dot}
          stroke={MARK.halo}
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
