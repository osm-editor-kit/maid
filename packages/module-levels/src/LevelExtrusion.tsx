/**
 * The rooms of each level in 3D: the extruded polygons from extrusion.ts, drawn while the level view is in 3D
 * (view-store.ts). Off, it renders nothing and the scan of the data does not run.
 */
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import type { ExpressionSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { type ExtrusionCollection, extrusionOf } from './extrusion.ts'
import { useThreeD } from './view-store.ts'

const SOURCE = 'levels-extrusion'
/** The tilt of 3D: the map may be tilted up to MAX_PITCH, and goes to TILT when 3D is on */
const MAX_PITCH = 60
const TILT = 55

/** Colours by kind (never violet: that is the colour of relation editing). Features on other levels are pale. */
const COLOUR = {
  room: '#e3c79b',
  floor: '#d8dadd',
  elevator: '#6f8497',
  stairs: '#f08a24',
  other: '#eceef1',
} as const

const COLOUR_BY_KIND: ExpressionSpecification = [
  'match',
  ['get', 'kind'],
  'room',
  COLOUR.room,
  'floor',
  COLOUR.floor,
  'elevator',
  COLOUR.elevator,
  'stairs',
  COLOUR.stairs,
  COLOUR.room,
]

/** The selection's colour on the map (renderer layers.ts HOVER), for the selected feature in 3D */
const SELECTED_COLOUR = '#f6634f'

const EMPTY: ExtrusionCollection = { type: 'FeatureCollection', features: [] }

/**
 * The extrusion layer. The opacity is a constant: fill-extrusion-opacity cannot be data-driven in MapLibre.
 * Its source and layer are flat, as in the shapes module (RectangleOnMap), and drawn on top of the OSM layers.
 */
function layerFor(selected: readonly string[]): LayerProps {
  return {
    id: 'levels-extrusion',
    type: 'fill-extrusion',
    source: SOURCE,
    // the selected features have a layer of their own (selectedLayerFor)
    filter: ['!', isSelected(selected)],
    paint: {
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'top'],
      'fill-extrusion-color': ['case', ['!', ['get', 'chosen']], COLOUR.other, COLOUR_BY_KIND],
      'fill-extrusion-opacity': 0.75,
    },
  }
}

/**
 * The selected features in the map's selection colour, opaque (the opacity of a fill-extrusion layer is one value for
 * all its features, so the selection has its own layer) and a little higher, so that they stand out of the others
 */
function selectedLayerFor(selected: readonly string[]): LayerProps {
  return {
    id: 'levels-extrusion-selected',
    type: 'fill-extrusion',
    source: SOURCE,
    filter: isSelected(selected),
    paint: {
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['+', ['get', 'top'], 0.5],
      'fill-extrusion-color': SELECTED_COLOUR,
      'fill-extrusion-opacity': 1,
    },
  }
}

function isSelected(selected: readonly string[]): ExpressionSpecification {
  return ['in', ['coalesce', ['get', 'id'], ''], ['literal', [...selected]]]
}

export function LevelExtrusion({ engine }: { engine: MaidEngine }) {
  const threeD = useThreeD()
  useTilt(engine, threeD)
  // the scan and the layer exist only in 3D; a hook cannot sit behind the `if`, so they are a component of their own
  return threeD ? <Extrusion engine={engine} /> : null
}

function Extrusion({ engine }: { engine: MaidEngine }) {
  // `subscribe` fires on every change of the data and of the level, so the version is the change to scan for
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion)
  const level = useSyncExternalStore(engine.subscribe, () => engine.level)
  const selected = useSyncExternalStore(engine.subscribe, () => engine.selected())
  const [collection, setCollection] = useState<ExtrusionCollection | null>(null)

  useEffect(
    function scanTheLoadedWays() {
      // once per animation frame: a burst of changes in one frame cancels the earlier request and scans once
      const frame = requestAnimationFrame(() => {
        const { ways } = engine.data.all()
        // the features without a level have no height: while they are edited, every level shows
        setCollection(
          extrusionOf(
            ways,
            (id) => engine.data.node(id)?.loc,
            typeof level === 'number' ? level : null,
          ),
        )
      })
      return () => cancelAnimationFrame(frame)
    },
    [engine, version, level],
  )

  return (
    <>
      <Source id={SOURCE} type="geojson" data={collection ?? EMPTY} />
      <Layer {...layerFor(selected)} />
      <Layer {...selectedLayerFor(selected)} />
    </>
  )
}

/**
 * Tilts the map while 3D is on. The maximum pitch is opened here, and set back when 3D goes off. MapView passes
 * maxPitch={0} as a prop; react-map-gl applies a prop only when it changes, so this imperative call is what
 * holds until the prop changes. setMaxPitch(0) snaps a pitch above 0 at once (MapLibre clamps it), so when 3D goes
 * off the pitch eases to 0 first and the maximum is set back when the move ends.
 */
function useTilt(engine: MaidEngine, threeD: boolean) {
  const wasOn = useRef(false)

  useEffect(
    function tiltTheMap() {
      const map = engine.map
      if (!map) return
      if (threeD) {
        wasOn.current = true
        map.setMaxPitch(MAX_PITCH)
        map.easeTo({ pitch: TILT })
        return
      }
      if (!wasOn.current) return
      wasOn.current = false
      map.easeTo({ pitch: 0 })
      if (map.getPitch() === 0) {
        map.setMaxPitch(0)
        return
      }
      // a tilt started again before the move ends: the cleanup takes this listener away
      const flatten = () => map.setMaxPitch(0)
      map.once('moveend', flatten)
      return () => {
        map.off('moveend', flatten)
      }
    },
    [engine, threeD],
  )
}
