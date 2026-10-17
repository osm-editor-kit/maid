import './extension-points'
export { dashPatterns, FeatureBuilder, type FeatureBatch } from './build'
export { labelOf, type LabelFlags } from './label'
export {
  MaidEngine,
  type EngineMetrics,
  type EngineOptions,
  type EntityInfo,
  type Mode,
} from './engine'
export type { ChangeTagsResult, TagChangeRequest } from './change-tags'
export { type FieldOverlay, type SideChoice } from './field-overlay'
export { distanceMetres, formatMetres } from './measure'
// A module's own map mode: the pointer on the map goes to the module while it is on (module-mode.ts)
export {
  CLICK_AFTER_DRAG_MS,
  isTextField,
  type ModuleMode,
  type ModuleModeInfo,
  type ModuleModeKey,
  type ScreenPoint,
} from './module-mode'
export {
  BELOW_OSM_LAYER,
  drawTools,
  operations,
  type ConstraintInput,
  type ConstraintItem,
  type ConstraintResult,
  type DrawToolItem,
  type MapContentItem,
  type MapContentProps,
  type MapLayerItem,
} from './extension-points'
// The modifier keys that drawing and dragging read (engine.modifiers, ADR 0011)
export { modifiersOf, NO_MODIFIERS, type Modifiers } from './modifiers'
export {
  ADDRESS_PLAQUE,
  buildLayers,
  DISPLAYS,
  displayOf,
  interactiveLayerIds,
  type MapDisplay,
  SOURCES,
  type LayerOptions,
} from './layers'
export { editKindOf, type EditKind } from './edits'
export { iconImagePrefix, iconImagesRequestedAt } from './icon-requests'
// The white arrow of the selected way, preloaded by the engine: a module's line-pattern can use it for its own arrows
export { SELECTED_ARROW_HEIGHT, SELECTED_ARROW_IMAGE } from './direction'
export { ModuleLayers } from './ModuleLayers'
export { OsmLayers } from './OsmLayers'
export { OsmData, type MergeResult } from './data'
export { DrawTool, type DrawKind } from './draw'
export { TransformTool, type TransformKind } from './transform'
// The rule for the Rotate (R) hint of a direction field, shared with the documentation popover (ui).
export { showsDirectionRotateHint } from '@osm-editor-kit/maid-operations'

// how far a click or a corner reaches to snap to a node or a way, in screen pixels
export { SNAP_PX, type SnapTarget } from './snap'
