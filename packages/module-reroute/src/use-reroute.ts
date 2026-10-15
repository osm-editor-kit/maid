// The reroute as the components read it: the data graph (read again after each change of it), the route relation,
// and the preview for the state of the reroute. Both the map and the inspector section use it; the preview is pure
// and cheap (about 1 to 2 ms on the dense fixture), so each computes its own from the same inputs.
import type { Editor } from '@osm-editor-kit/maid-core'
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import { useMemo, useSyncExternalStore } from 'react'
import {
  useRerouteEnd,
  useRerouteOccurrence,
  useRerouteRelationId,
  useRerouteRoleChoices,
  useRerouteStart,
} from './reroute-store.ts'
import { previewReroute } from './route.ts'

/** The history's staging graph, read again after each change (an external store: the React Compiler keeps it out of memos) */
export function useStagingGraph(editor: Editor): Graph {
  return useSyncExternalStore(
    (listener) => {
      const offs = [
        editor.history.on('stagingchange', listener),
        editor.history.on('stablechange', listener),
        editor.history.on('historyjump', listener),
      ]
      return () => offs.forEach((off) => off())
    },
    () => editor.history.staging.graph,
  )
}

/** The reroute now: its relation, the preview, and the graph it was made on. `relation` is undefined when none is set. */
export function useReroute(editor: Editor) {
  const graph = useStagingGraph(editor)
  const relationId = useRerouteRelationId()
  const start = useRerouteStart()
  const end = useRerouteEnd()
  const occurrence = useRerouteOccurrence()
  const roleChoices = useRerouteRoleChoices()
  const entity = relationId === undefined ? undefined : graph.hasEntity(relationId)
  const relation = entity instanceof OsmRelation ? entity : undefined
  const preview = useMemo(
    () =>
      relation
        ? previewReroute(graph, relation, { start, end, occurrence, roleChoices })
        : undefined,
    [graph, relation, start, end, occurrence, roleChoices],
  )
  return { graph, relationId, relation, preview }
}
