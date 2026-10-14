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
export {
  BELOW_OSM_LAYER,
  operations,
  type MapContentItem,
  type MapContentProps,
  type MapLayerItem,
} from './extension-points'
export {
  ADDRESS_PLAQUE,
  buildLayers,
  interactiveLayerIds,
  SOURCES,
  type LayerOptions,
} from './layers'
export { iconImagePrefix, iconImagesRequestedAt } from './icon-requests'
export { ModuleLayers } from './ModuleLayers'
export { OsmLayers } from './OsmLayers'
export { OsmData, type MergeResult } from './data'
export { DrawTool, type DrawKind } from './draw'
export { TransformTool, type TransformKind } from './transform'
// the rule for the Rotate (R) hint of a direction field, shared with the documentation popover (ui)
export { showsDirectionRotateHint } from '@osm-editor-kit/maid-operations'
