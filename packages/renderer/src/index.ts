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
  type ModuleModeDragInfo,
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
  type ConstraintLabel,
  type ConstraintResult,
  type DrawToolItem,
  type MapContentItem,
  type MapContentProps,
  type MapLayerItem,
  type MapViewItem,
} from './extension-points'
export { whileLens } from './while-lens'
// The modifier keys that drawing and dragging read (engine.modifiers, ADR 0011)
export { modifiersOf, NO_MODIFIERS, type Modifiers } from './modifiers'
export {
  ADDRESS_PLAQUE,
  buildLayers,
  DISPLAYS,
  displayOf,
  interactiveLayerIds,
  type MapDisplay,
  PIN_SHADOW,
  PLAQUE_SHADOW,
  SHADOW_COLOUR,
  SHADOW_PAD,
  SOURCES,
  type LayerOptions,
} from './layers'
export { editKindOf, type EditKind } from './edits'
export { iconImagePrefix, iconImagesRequestedAt } from './icon-requests'
// The selected way's drawing triangle as a line pattern, preloaded by the engine (the relations map)
export { SELECTED_ARROW_HEIGHT, SELECTED_ARROW_PATTERN } from './direction'
// The riding-direction glyphs for a module's own lines, as line patterns (the bicycle infrastructure, ADR 0017)
export {
  LINE_GLYPH_HEIGHT,
  LINE_GLYPH_SPACING,
  lineGlyphImageId,
  type LineGlyphKind,
} from './direction'
export { GLYPH_KINDS, type GlyphKind, type GlyphShape } from './glyph'
export { IncrementalSource } from './IncrementalSource'
export { ModuleLayers } from './ModuleLayers'
export { OsmLayers } from './OsmLayers'
export { OsmData, type MergeResult } from './data'
export { DrawTool, sourceWayOf, type CopiedTags, type DrawKind } from './draw'
// actionMoveNodes: many nodes in one commit, as Rotate moves them (the resize box uses it)
export { actionMoveNodes, TransformTool, type RotationInfo, type TransformKind } from './transform'
// The rule for the Rotate (R) hint of a direction field, shared with the documentation popover (ui).
export { showsDirectionRotateHint } from '@osm-editor-kit/maid-operations'

// how far a click or a corner reaches to snap to a node or a way, in screen pixels
export { SNAP_PX, type SnapTarget } from './snap'
// the direction glyphs as SVG path data: the files in assets/direction and the ui's DirectionIcon
export {
  DIRECTION_SHAPES,
  DIRECTION_VIEWBOX,
  directionMeaning,
  directionParts,
  directionSvg,
  type DirectionPart,
  type DirectionShape,
} from './direction-svg'
