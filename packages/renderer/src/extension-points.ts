/**
 * Extension points that the renderer declares. Importing this file (index.ts does) merges them
 * into the `ExtensionPoints` of maid-core, so every app that uses the renderer can register items.
 */
import { defineModule, type Editor } from '@osm-editor-kit/maid-core'
import type { Operation } from '@osm-editor-kit/maid-operations'
import type { Feature, FeatureCollection } from 'geojson'
import type { RasterSourceSpecification } from 'maplibre-gl'
import type { ComponentType } from 'react'
import type { LayerProps } from 'react-map-gl/maplibre'
import type { MaidEngine } from './engine'
import type { Modifiers } from './modifiers'
import type { Point } from './snap'

/** Omit per member of a union. A plain `Omit` would keep only one kind of layer. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** The props of one layer. The source comes from the item's `source`, so it is left out. */
export type MapLayerProps = DistributiveOmit<LayerProps, 'source'>

/** A GeoJSON source and the layers that draw it, drawn on top of the OSM layers. */
export type MapLayerItem = {
  id: string
  source: { id: string; data: FeatureCollection | Feature }
  /** Layers of this source. Ids are unique on the map. */
  layers: MapLayerProps[]
}

/**
 * The id of an invisible layer right below the OSM layers. A layer with `beforeId` set to it is
 * drawn under the OSM data (a background); a layer without `beforeId` is drawn on top of it.
 */
export const BELOW_OSM_LAYER = 'maid-below-osm'

export type MapContentProps = {
  editor: Editor
  /** Pass as `beforeId` to draw under the OSM data */
  belowOsm: typeof BELOW_OSM_LAYER
  /**
   * The map engine, for a module that takes the pointer while it works on the map (`engine.enterModuleMode`, see
   * module-mode.ts). Absent where the app does not pass it to ModuleLayers; such a module does nothing then.
   */
  engine?: MaidEngine
}

/**
 * Anything a module draws on the map itself: a component rendered inside the map, which brings
 * its own `<Source>` and `<Layer>` elements of any kind (raster, vector, GeoJSON) and can use
 * `useMap`. For a plain GeoJSON overlay `map.layer` is less work.
 */
export type MapContentItem = { id: string; component: ComponentType<MapContentProps> }

/**
 * What a module allows the map's camera beyond the flat default (the editor works top-down: iD and Rapid have no tilt).
 * `maxPitch` above 0 lets the map tilt, by the module's own controls, two fingers and the `map=` URL's fifth number;
 * the largest of all items wins. Used by the terrain module for its 3D view. Mouse tilt stays off: a right-drag is
 * the edit menu's, and dragRotate is off for the turn (MapView).
 */
export type MapViewItem = { id: string; maxPitch: number }

/**
 * The imagery the map shows now, under the OSM data: what a measure on the map takes as its source,
 * and what a changeset cites as `imagery_used`. A module that draws imagery contributes it; the app
 * reads it outside React (`editor.registry('imagery.used').list()`). Names are as iD cites them.
 */
export type ImageryUsedItem = {
  id: string
  /** The names of the imagery visible now: the background first, then the overlays. Empty when none. */
  used: () => string[]
  /** The name of the background alone; undefined with no background (none chosen, or the plain style) */
  background: () => string | undefined
  /**
   * The background as a MapLibre raster source, with its brightness, for the measure's magnifier, which
   * draws it alone in a small map of its own. Undefined with no background, or until it is drawn.
   */
  backgroundSource?: () => { source: RasterSourceSpecification; brightness: number } | undefined
}

/**
 * What a constraint is asked about a node that is placed (a drawn click, the drawn node that follows the pointer) or dragged
 * (a vertex). All in screen pixels. ADR 0011.
 */
export type ConstraintInput = {
  kind: 'draw' | 'drag'
  /** The pointer on the screen, in pixels */
  point: Point
  /**
   * The fixed nodes next to the placed node, on the screen. One neighbour for the end of a line, two for a corner
   * (an area's draw node between the last and the first node, or a dragged vertex).
   */
  neighbours: { at: Point; before?: Point }[]
  modifiers: Modifiers
  /** The bearing of the map, in degrees */
  bearing: number
  /**
   * Metres on the ground per screen pixel, at the latitude and zoom of the first neighbour (or of the pointer with
   * none). A constraint that rounds lengths in metres converts with it. ADR 0011.
   */
  metresPerPixel: number
}

/** A text on the map at a place on the screen, e.g. the length of a segment in metres (drawn in the guides layer) */
export type ConstraintLabel = { at: Point; text: string }

/**
 * A constrained place on the screen, the guide lines to draw through it (pairs of points), and labels to show. A result
 * may keep the point as it was and give only labels.
 */
export type ConstraintResult = {
  point: Point
  guides: [Point, Point][]
  labels?: ConstraintLabel[]
}

/**
 * A module's rule for where a node goes on open ground. Feature snapping always wins: a constraint is asked only when the
 * pointer is not on a node or a way. The first item that returns a result wins.
 */
export type ConstraintItem = {
  id: string
  constrain(input: ConstraintInput): ConstraintResult | undefined
}

/**
 * A drawing tool that the Area button's dropdown offers beside "Area" (ADR 0011, hook 3). `start` usually enters a
 * module mode (`enterModuleMode`), whose callbacks take the clicks. A tool has no key of its own: 3 starts an area,
 * and 3 again before the first click steps to the first tool (33), the next (333) and back to the area (Tobias,
 * 2026-10-17).
 *
 * With `placement: 'button'` the tool is a button of its own in the add row, after the Area button, instead of an entry
 * of the dropdown (the room tool of the indoor editor, Tobias 2026-11-03). Such a tool is not reached with 3 again.
 */
export type DrawToolItem = {
  id: string
  geometry: 'area'
  /** Its name in the dropdown and its tooltip. A function, so that the text is read in the language of the moment. */
  label: () => string
  icon?: ComponentType
  /** Where the tool is offered: an entry of the Area dropdown (the default) or a button of its own in the add row */
  placement?: 'menu' | 'button'
  /** The short name under the button's icon, for `placement: 'button'`; without it the button shows only its icon */
  text?: () => string
  /**
   * Why the tool cannot start with this selection, shown as the button's tooltip while it is disabled; undefined when it
   * can. Asked on each change of the selection. Without it the tool can always start.
   */
  unavailable?: (selected: readonly string[]) => string | undefined
  /** The second line of the button's tooltip while the tool can start: what the next click does */
  description?: () => string
  /** Starts the tool. `selected` is the selection when it was started, for a tool that works on the selected feature */
  start(engine: MaidEngine, selected?: readonly string[]): void
}

declare module '@osm-editor-kit/maid-operations' {
  /** An operation's `start` gets the engine and the editor it runs on (ADR 0011, hook 5) */
  interface OperationHost {
    engine: MaidEngine
    editor: Editor
  }
}

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'map.layer': MapLayerItem
    'map.content': MapContentItem
    /** What the camera may do beyond the flat default (see MapViewItem) */
    'map.view': MapViewItem
    /** Something the editor can do to the selection: shown in the edit menu, run with its key */
    'edit.operation': Operation
    /** The imagery visible on the map now (see ImageryUsedItem). Declared here because it describes the map. */
    'imagery.used': ImageryUsedItem
    /** Where a drawn or dragged node goes on open ground (see ConstraintItem) */
    'draw.constraint': ConstraintItem
    /** A drawing tool beside the Area button (see DrawToolItem) */
    'draw.tool': DrawToolItem
  }
}

/** A module that adds operations to the edit menu, for example `defaultOperations` of maid-operations */
export function operations(list: Operation[]) {
  return defineModule({
    id: 'operations',
    setup(api) {
      for (const operation of list) api.register('edit.operation', operation)
    },
  })
}

/** A module that adds drawing tools to the Area button's dropdown */
export function drawTools(list: DrawToolItem[]) {
  return defineModule({
    id: 'draw-tools',
    setup(api) {
      for (const tool of list) api.register('draw.tool', tool)
    },
  })
}
