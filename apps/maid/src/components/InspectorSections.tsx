import type { Editor } from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'

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
            <section key={section.id} className="mt-4">
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
                {section.title}
              </h3>
              <Content entity={entity} editor={editor} />
            </section>
          )
        })}
    </>
  )
}
