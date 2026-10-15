import { m } from '@osm-editor-kit/maid-i18n'
import { SidebarDisclosure } from '@osm-editor-kit/maid-ui'
import { IssueRow, useSharedIssues } from '../modules/validation'
import { useShell } from '../shell-context'

/**
 * The issues of several selected features, as iD's entity issues section shows them for a selection:
 * every issue that involves any of them, in iD's order (`sharedIssues`), with the same rows as the
 * inspector of one feature, fixes included. Nothing is shown when there are no such issues.
 */
export function MultiIssues({ ids }: { ids: readonly string[] }) {
  const { editor } = useShell()
  const issues = useSharedIssues(editor, ids)
  if (issues.length === 0) return null
  return (
    <SidebarDisclosure title={m.issues_title()} detail={issues.length} defaultOpen>
      <ul>
        {issues.map((issue) => (
          <IssueRow key={issue.id} editor={editor} issue={issue} />
        ))}
      </ul>
    </SidebarDisclosure>
  )
}
