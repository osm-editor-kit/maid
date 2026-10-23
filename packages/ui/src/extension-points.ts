/**
 * Extension points of the editor's UI. Modules add items to them; this file declares their types.
 * The renderer's `map.layer` point is declared in maid-renderer.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo, MaidEngine } from '@osm-editor-kit/maid-renderer'
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
   * Whether the filters make an entity read-only (looked at, not changed). A section that changes an entity checks it
   * before it writes, and says why when it cannot. Absent where the shell does not pass it: nothing is read-only then.
   */
  readOnly?: (id: string) => boolean
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
  /** `'relation'`: the section edits relations: the relation icon before its title, violet while open (relation-tone.ts) */
  tone?: 'relation'
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
  /** Whether a filter makes this feature read-only: a view must not write it (the engine's isReadOnly) */
  readOnly: (id: string) => boolean
}

/** A view in the dock under the map, with its own tab */
export type DockView = {
  id: string
  label: string
  component: ComponentType<DockViewProps>
  /**
   * Whether the view has something to show now: its tab is left out while `get` is false (Tobias, 2026-10-23: no empty
   * tabs; the way table without a selected way, the import review before a file is loaded). `get` is asked again on
   * every change of the selection and whenever `subscribe` calls its listener. Absent: always shown.
   */
  available?: {
    get: (context: { readonly selected: readonly string[] }) => boolean
    subscribe?: (listener: () => void) => () => void
  }
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
  /** Gets the editor and the map engine (for a panel that shows or sets what the map shows) */
  component: ComponentType<{ editor: Editor; engine: MaidEngine }>
  /** Tailwind width class of the flyout, e.g. `w-96` (the default) */
  width?: string
}

/**
 * An entry in the account menu of the top bar, below the login: for a job that is rarely needed and does not deserve a
 * button of its own (loading a file of changes). The component renders its own button; `close` closes the menu.
 */
export type AccountMenuItem = {
  id: string
  component: ComponentType<{ editor: Editor; engine: MaidEngine; close: () => void }>
}

/**
 * What a module adds to the changeset of an upload: tags of its own, and a comment the save form starts with. Read when
 * the form opens (`comment`) and at the upload (`tags`). A module's tags never replace the ones the shell sets itself
 * (`created_by`, `comment`, `hashtags`, `source`, `imagery_used`).
 */
export type ChangesetContribution = {
  id: string
  tags?: () => Readonly<Record<string, string>>
  /** The comment to start with when the form's comment is empty; undefined for none */
  comment?: () => string | undefined
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
    'account.item': AccountMenuItem
    'changeset.tags': ChangesetContribution
  }
}
