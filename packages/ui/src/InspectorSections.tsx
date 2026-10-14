import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import type { InspectorSectionProps } from './extension-points.ts'
import { SidebarDisclosure, SidebarSection } from './Sidebar.tsx'

/**
 * The `inspector.section` items of the editor that apply to this entity. The inspector renders it twice: with
 * `placement="top"` above the fields for the sections that ask for it, and without it below the tag list for the rest.
 */
export function InspectorSections({
  entity,
  editor,
  select,
  entities,
  onFieldFocus,
  onRelated,
  placement,
}: InspectorSectionProps & { placement?: 'top' }) {
  const sections = useExtensionPoint(editor, 'inspector.section')
  return (
    <>
      {sections
        .filter((section) => section.placement === placement)
        .filter((section) =>
          entities
            ? // several features: only the sections made for it, when every feature fits
              section.multiple === true &&
              entities.every((item) => !section.when || section.when(item))
            : !section.when || section.when(entity),
        )
        .map((section) => {
          const Content = section.component
          const content = (
            <Content
              entity={entity}
              editor={editor}
              select={select}
              entities={entities}
              onFieldFocus={onFieldFocus}
              onRelated={onRelated}
            />
          )
          return section.disclosure ? (
            <SidebarDisclosure
              key={section.id}
              title={section.title}
              detail={section.detail?.(entity, editor)}
              defaultOpen={section.disclosure === 'open'}
            >
              {content}
            </SidebarDisclosure>
          ) : (
            <SidebarSection key={section.id} title={section.title}>
              {content}
            </SidebarSection>
          )
        })}
    </>
  )
}
