/**
 * The person's recent changesets from the server, for the save flyout's suggestions, as iD does (osm.userChangesets,
 * ui/changeset_editor.js): `GET /api/0.6/changesets.json` for the person, newest first, the API's default of 100. Only
 * the comment and the source of each are read. The request goes through the editor's fetch (the gate of the OSM
 * service, the time limit, the automation refusal) and is a public read: no login token is sent. It is asked only for
 * a person who is logged in, to the server of the data (`config.apiUrl`): the mock API answers it with an empty list.
 * The answer is kept for ten minutes per server and person (TanStack Query, never retried: the list is a convenience).
 */
import { keys, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { cleanTagValue } from './changeset-draft.ts'
import { sourceValues } from './changeset-history.ts'

/** How long the list of a person is not asked again */
export const RECENT_CHANGESETS_STALE_MS = 10 * 60_000

/** The comments and the single source values of recent changesets, newest first, each once */
export type RecentValues = { comments: string[]; sources: string[] }

export const NO_RECENT: RecentValues = { comments: [], sources: [] }

/** The request for a person's newest changesets (`display_name` is what the login keeps, no user id is needed) */
export function recentChangesetsUrl(apiUrl: string, displayName: string): string {
  const base = apiUrl.replace(/\/+$/, '')
  const query = new URLSearchParams({ display_name: displayName })
  return `${base}/api/0.6/changesets.json?${query}`
}

const answer = z.object({ changesets: z.array(z.unknown()) })
const changeset = z.object({
  tags: z.object({ comment: z.string().optional(), source: z.string().optional() }).optional(),
})

/**
 * The comments and sources in the server's answer: the comment of each changeset that has one (iD drops the others),
 * and the single values of each source (iD splits at `;`). Newest first as the server sends them, each value once,
 * case-sensitive. A changeset that does not fit is skipped; an answer that does not fit gives nothing.
 */
export function parseRecentChangesets(json: unknown): RecentValues {
  const parsed = answer.safeParse(json)
  if (!parsed.success) return NO_RECENT
  const comments = new Set<string>()
  const sources = new Set<string>()
  for (const raw of parsed.data.changesets) {
    const item = changeset.safeParse(raw)
    if (!item.success) continue
    const comment = cleanTagValue(item.data.tags?.comment ?? '')
    if (comment !== '') comments.add(comment)
    for (const value of sourceValues(item.data.tags?.source)) sources.add(value)
  }
  return { comments: [...comments], sources: [...sources] }
}

/** The query of a person's recent changesets, for `useQuery`. Disabled without `user`. */
export function recentChangesetsQuery(options: {
  remote: RemoteFetch
  apiUrl: string
  user: string | undefined
}) {
  const { remote, apiUrl, user } = options
  return queryOptions({
    queryKey: keys.osmChangesets(apiUrl, user ?? ''),
    queryFn: async ({ signal }): Promise<RecentValues> => {
      if (user === undefined) return NO_RECENT
      const response = await remote(recentChangesetsUrl(apiUrl, user), {
        signal,
        headers: { Accept: 'application/json' },
        service: 'osm',
      })
      return parseRecentChangesets(await response.json())
    },
    enabled: user !== undefined,
    staleTime: RECENT_CHANGESETS_STALE_MS,
    gcTime: Infinity,
    retry: false,
  })
}
