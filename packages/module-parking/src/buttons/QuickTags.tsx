import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import type { ReactNode } from 'react'

/**
 * Buttons that set the parking tags of the selected road in one click (QUICK_TAGS). `ids` are the selected ways.
 * Renders nothing until the buttons agent fills it in.
 */
export function QuickTags(props: { ids: readonly string[] }): ReactNode {
  void props
  return null
}

/** The inspector section around QuickTags (`inspector.section`): the selected way is the one id */
export function QuickTagsSection({ entity }: InspectorSectionProps): ReactNode {
  return <QuickTags ids={[entity.id]} />
}
