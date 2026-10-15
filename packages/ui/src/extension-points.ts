/**
 * Extension points of the editor's UI. Modules add items to them; this file declares their types.
 * The renderer's `map.layer` point is declared in maid-renderer.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import type { ComponentType, ReactNode } from 'react'
import type { FieldComponent, FieldFocus } from './inspector/fields/shared.ts'

/** What a section is given. It edits through `editor.history`; the map follows every change. */
export type InspectorSectionProps = {
  entity: EntityInfo
  editor: Editor
  /** Selects another entity (or several, or nothing), for example a member of a relation */
  select: (selection: string | readonly string[] | null) => void
  /**
   * Every selected entity, when the section is shown for several (`InspectorSection.multiple`); `entity` is then the
   * first of them. Absent for a single selection.
   */
  entities?: readonly EntityInfo[]
  /**
   * Tell the shell which field (and side) the section's control is about, so the map can show that side of the
   * selected way; null when the pointer or the focus leaves. Absent where the shell cannot show it (several features).
   */
  onFieldFocus?: (focus: FieldFocus | null) => void
  /**
   * Highlight these features on the map as related to the selection (the engine's calmer halo); null clears it.
   * The turn restrictions section shows its FROM, TO and via ways with it.
   */
  onRelated?: (ids: readonly string[] | null) => void
}

/** A block in the inspector, below the tag list (or above the fields: `placement`). Shown when `when` is absent or returns true. */
export type InspectorSection = {
  id: string
  title: string
  when?: (entity: EntityInfo) => boolean
  /** `'top'`: above the fields, for the section an editor is made for (the parking buttons). Absent: below the tag list. */
  placement?: 'top'
  /**
   * Also shown when several features are selected, if `when` holds for every one of them. The component then gets
   * `entities`.
   */
  multiple?: boolean
  /** Folds away under its title: `'closed'` starts folded, `'open'` unfolded. Absent: always shown. */
  disclosure?: 'open' | 'closed'
  /** A quiet word after the title that stays readable while folded: a count, an id */
  detail?: (entity: EntityInfo, editor: Editor) => string | number | undefined
  component: ComponentType<InspectorSectionProps>
}

/** What a view in the dock is given */
export type DockViewProps = {
  editor: Editor
  /** Selects an entity (or several, or nothing), for example the one an issue is about */
  select: (selection: string | readonly string[] | null) => void
  /** The ids selected now, in selection order (empty: nothing selected) */
  selected: readonly string[]
  /**
   * Marks features on the map while the pointer or the focus is on a row or a column that stands for them, with the
   * calm halo of related features (the engine's setRelated); null clears it.
   */
  highlight: (ids: readonly string[] | null) => void
}

/** A view in the dock under the map, with its own tab */
export type DockView = {
  id: string
  label: string
  component: ComponentType<DockViewProps>
}

/**
 * A panel behind an icon button at the right of the top bar, opened as a flyout: one job per
 * button (backgrounds, photos, data layers, map style).
 */
export type TopBarPanel = {
  id: string
  /** Names the button and the panel */
  label: string
  icon: ReactNode
  component: ComponentType<{ editor: Editor }>
  /** Tailwind width class of the flyout, e.g. `w-96` (the default) */
  width?: string
}

/**
 * A field type that a module brings: the component that the inspector's field rows use for
 * fields of this `type` (iD's field type, or a module's own, e.g. `trafficSign`). It gets the
 * same props as the built-in field components.
 */
export type InspectorFieldType = { id: string; type: string; component: FieldComponent }

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'inspector.section': InspectorSection
    'dock.view': DockView
    'inspector.field': InspectorFieldType
    'topbar.panel': TopBarPanel
  }
}
