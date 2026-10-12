/**
 * Extension points of the editor's UI. Modules add items to them; this file declares their types.
 * The renderer's `map.layer` point is declared in maid-renderer.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import type { ComponentType } from 'react'

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
  component: ComponentType<InspectorSectionProps>
}

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'inspector.section': InspectorSection
  }
}
