/**
 * Extension points of this app. Modules add items to them; this file declares their types.
 * The renderer's `map.layer` point is declared in maid-renderer.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import type { ComponentType } from 'react'

/** A block in the inspector, below the tag list. Shown when `when` is absent or returns true. */
export type InspectorSection = {
  id: string
  title: string
  when?: (entity: EntityInfo) => boolean
  component: ComponentType<{ entity: EntityInfo; editor: Editor }>
}

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'inspector.section': InspectorSection
  }
}
