import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import type { InspectorSectionProps } from './extension-points.ts'
import { SidebarSection } from './Sidebar.tsx'

/** The `inspector.section` items of the editor that apply to this entity, below the tag list. */
export function InspectorSections({ entity, editor, select }: InspectorSectionProps) {
  const sections = useExtensionPoint(editor, 'inspector.section')
  return (
    <>
      {sections
        .filter((section) => !section.when || section.when(entity))
        .map((section) => {
          const Content = section.component
          return (
            <SidebarSection key={section.id} title={section.title}>
              <Content entity={entity} editor={editor} select={select} />
            </SidebarSection>
          )
        })}
    </>
  )
}
