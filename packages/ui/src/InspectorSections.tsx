import type { Editor } from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import { SidebarSection } from './Sidebar.tsx'

/** The `inspector.section` items of the editor that apply to this entity, below the tag list. */
export function InspectorSections({ entity, editor }: { entity: EntityInfo; editor: Editor }) {
  const sections = useExtensionPoint(editor, 'inspector.section')
  return (
    <>
      {sections
        .filter((section) => !section.when || section.when(entity))
        .map((section) => {
          const Content = section.component
          return (
            <SidebarSection key={section.id} title={section.title}>
              <Content entity={entity} editor={editor} />
            </SidebarSection>
          )
        })}
    </>
  )
}
