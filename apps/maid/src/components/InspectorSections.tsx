import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import { useSyncExternalStore } from 'react'

/** The `inspector.section` items of the editor that apply to this entity, below the tag list. */
export function InspectorSections({ entity, editor }: { entity: EntityInfo; editor: Editor }) {
  const registry = editor.registry('inspector.section')
  // `list()` returns the same array until the registry changes, as useSyncExternalStore needs.
  // The arrows are memoized by the React Compiler, so the store is not resubscribed on each render.
  const sections = useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.list(),
  )
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
