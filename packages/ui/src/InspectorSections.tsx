import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import type { InspectorSectionProps } from './extension-points.ts'
import { RELATION_ICON_OPEN } from './relation-tone.ts'
import { RelationIcon } from './RelationIcon.tsx'
import { SidebarDisclosure, SidebarSection } from './Sidebar.tsx'

/**
 * The `inspector.section` items of the editor that apply to this entity. The inspector renders it twice: with
 * `placement="top"` above the fields for the sections that ask for it, and without it below the tag list for the rest.
 *
 * A section's `when` may read state outside React (the shell's open relation): the component is not compiled, so it asks
 * again on every render, and `refresh` is the value whose change makes the inspector render it again.
 */
export function InspectorSections({
  entity,
  editor,
  select,
  entities,
  onFieldFocus,
  onRelated,
  readOnly,
  placement,
}: InspectorSectionProps & { placement?: 'top'; refresh?: unknown }) {
  'use no memo'
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
              readOnly={readOnly}
            />
          )
          return section.disclosure ? (
            <SidebarDisclosure
              key={section.id}
              title={section.title}
              detail={section.detail?.(entity, editor)}
              defaultOpen={section.disclosure === 'open'}
              icon={
                section.tone === 'relation'
                  ? (open) => (
                      <RelationIcon
                        className={`size-4 shrink-0 ${open ? RELATION_ICON_OPEN : 'text-zinc-500 dark:text-zinc-400'}`}
                      />
                    )
                  : undefined
              }
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
