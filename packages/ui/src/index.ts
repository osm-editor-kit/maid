import './extension-points.ts'

export { BottomSheet } from './BottomSheet.tsx'
export { ContextMenu, type MenuItem } from './ContextMenu.tsx'
export { Dock, type DockTab } from './Dock.tsx'
export { openDockView } from './dock-request.ts'
export { Flyout } from './Flyout.tsx'
export { PencilSlashIcon } from './PencilSlashIcon.tsx'
export { autoFocusFields } from './auto-focus.ts'
export { Dialog } from './Dialog.tsx'
export { TagDiff } from './TagDiff.tsx'
export { serializeTags } from './sheet/clipboard.ts'
export {
  InfoPopover,
  referenceTag,
  wikiTitleOf,
  wikiUrl,
  type Reference,
  type ReferenceInfo,
  type ReferenceLoader,
} from './InfoPopover.tsx'
export { FilterPanel } from './FilterPanel.tsx'
export { MapDisplayChoice } from './MapDisplayChoice.tsx'
export { chooseDisplay } from './display.ts'
export { FadeSlideIn, UI_SPRING } from './motion.tsx'
export { lazyChunksPending, lazyComponent, PANEL_FALLBACK, preloadLazyComponents } from './lazy.tsx'
export { fitMiniMap, type LonLat, type MiniMapBox, type MiniMapFrame } from './mini-map.ts'
export type {
  DockView,
  DockViewProps,
  InspectorSection,
  InspectorSectionProps,
  TopBarPanel,
  AccountMenuItem,
  ChangesetContribution,
  InspectorFieldType,
} from './extension-points.ts'
export { InspectorSections } from './InspectorSections.tsx'
export * from './inspector/index.ts'
export {
  RELATION_CHOSEN,
  RELATION_HEADING,
  RELATION_ICON,
  RELATION_ICON_OPEN,
  RELATION_OPEN_ROW,
  RELATION_SURFACE,
} from './relation-tone.ts'
export { RelationIcon } from './RelationIcon.tsx'
export { ControlButton, ControlGroup, MapControls } from './MapControls.tsx'
export { CommandBar, type CommandItem } from './CommandBar.tsx'
export { ResizeHandle } from './ResizeHandle.tsx'
export { Shell } from './Shell.tsx'
export {
  Sidebar,
  SidebarBody,
  SidebarDisclosure,
  SidebarEmpty,
  SidebarHeader,
  SidebarSection,
  stackedHeadingsCover,
  useStackedHeadings,
} from './Sidebar.tsx'
export {
  DRAWN_GEOMETRIES,
  ENGLISH_FAVOURITE_TEXTS,
  drawableGeometries,
  favouriteModifierLabel,
  favouritesFor,
  findFavouriteByNumber,
  isDrawnGeometry,
  setFavouriteNumber,
  type DrawnGeometry,
  type Favourite,
  type FavouriteEntry,
  type FavouriteTexts,
  type GeometryNames,
} from './favourites.ts'
export { FavouritesPanel } from './FavouritesPanel.tsx'
export { FavouriteNumberField } from './FavouriteNumberField.tsx'
export { AreaIcon, GeometryIcon, LineIcon } from './GeometryIcons.tsx'
export { setBearing, useBearing } from './bearing.ts'
export {
  getSettings,
  loadStoredSettings,
  settingsActions,
  subscribeToSettings,
  useSettingsActions,
  useStoredFavourites,
  useStoredLang,
  useStoredServer,
  useStoredShown,
  useStoredTheme,
  type Server,
  type Settings,
  type Theme,
} from './settings.ts'
export { initTheme, useAppliedTheme, useThemeInEffect } from './theme.ts'
export { ThemeSwitch } from './ThemeSwitch.tsx'
export {
  SegmentedControl,
  ToolButton,
  ToolGroup,
  toolButtonClass,
  toolButtonTone,
  type SegmentedOption,
} from './Toolbar.tsx'
export { DraftInput, useDraft } from './inspector/fields/DraftInput.tsx'
/** The class of a single-line text input, as the inspector's fields and the modules use it */
export {
  CHIP as FIELD_CHIP,
  CHIP_BOX as FIELD_CHIP_BOX,
  HINT as FIELD_HINT,
  INPUT as INPUT_CLASS,
  ROW_BUTTON as FIELD_ROW_BUTTON,
  tagChangeOf,
  writeEdits,
  type FieldTagEdit,
} from './inspector/fields/shared.ts'
export { Brand, TopBar } from './TopBar.tsx'
export { Time } from './Time.tsx'
export {
  absoluteTime,
  browserTimeZone,
  parseTime,
  preferRelative,
  relativeTime,
  type TimeValue,
} from './time.ts'
export { Tooltip, TooltipGroup } from './Tooltip.tsx'
export { formatShortcut } from './shortcut-label.ts'
export { errorText, notify, Toaster, type NotifyOptions } from './Toast.tsx'
export { useResizable } from './useResizable.ts'
export { useBreakpoint, type Breakpoint } from './useBreakpoint.ts'
export { PLAIN_INPUT } from './plain-input.ts'
export { SuggestTextarea } from './SuggestTextarea.tsx'
export { Sheet } from './sheet/Sheet.tsx'
export { CopyTagsButton, TagSheet, type TagSheetProps } from './sheet/tags/TagSheet.tsx'
export type { TagSheetChange } from './sheet/tags/tag-combined.ts'
export type { TagSuggestSource } from './sheet/tags/tag-suggest.ts'
export type {
  CellRef,
  CellValue,
  PasteReport,
  SheetBatch,
  SheetCellData,
  SheetChange,
  SheetClipboard,
  SheetColumn,
  SheetProps,
  SheetRow,
} from './sheet/types.ts'
export { WikiContext } from './inspector/fields/wiki-context.ts'
export { createWikiSource, type WikiSource } from './inspector/fields/wiki-service.ts'
