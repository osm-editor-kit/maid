import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { useShell } from '../shell-context'
import { useChangesetHistory } from './changeset-history-store.ts'
import { mergeRecent } from './changeset-suggestions.ts'
import { NO_RECENT, recentChangesetsQuery } from './recent-changesets.ts'

/**
 * The comments and single sources to offer in the save flyout: the person's own uploads (this browser), then their
 * recent changesets on the server (a logged-in person only, see recent-changesets.ts), each once, newest first.
 * While the server's list loads, or when it fails, the own history is what there is.
 */
export function useRecentChangesetValues() {
  const { editor, config } = useShell()
  const { user } = useAuth()
  const history = useChangesetHistory()
  const { data = NO_RECENT } = useQuery(
    recentChangesetsQuery({ remote: editor.fetch, apiUrl: config.apiUrl, user }),
  )
  return {
    comments: mergeRecent(history.comments, data.comments),
    sources: mergeRecent(history.sources, data.sources),
  }
}
