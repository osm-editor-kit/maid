/**
 * Extension points of the editor's UI. Modules add items to them; this file declares their types.
 * The renderer's `map.layer` point is declared in maid-renderer.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import type { ComponentType, ReactNode } from 'react'

/** What a section is given. It edits through `editor.history`; the map follows every change. */
export type InspectorSectionProps = {
  entity: EntityInfo
  editor: Editor
  /** Selects another entity (or several, or nothing), for example a member of a relation */
  select: (selection: string | readonly string[] | null) => void
}

/** A block in the inspector, below the tag list. Shown when `when` is absent or returns true. */
export type InspectorSection = {
  id: string
  title: string
  when?: (entity: EntityInfo) => boolean
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

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'inspector.section': InspectorSection
    'dock.view': DockView
    'topbar.panel': TopBarPanel
  }
}
