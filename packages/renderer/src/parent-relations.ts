/**
 * The parent relations of a downloaded entity, as iD asks for them: after `loadEntity` of a node, a way or a
 * relation, iD also calls `GET /api/0.6/[node|way|relation]/ID/relations` (services/osm.js loadEntityRelations;
 * core/context.ts loadEntity: "We need to fetch the parent relations separately"). Pure: the path, and the
 * memory of whether the server answers that route at all. The loader (tile-loader.ts) makes the call.
 */

/**
 * Whether the server answers the `/relations` route. Unknown until a call has been answered; `missing` once the
 * server answered 404, for the rest of the session (the loader keeps it: one engine is one session).
 */
export type ParentRelationsSupport = 'unknown' | 'supported' | 'missing'

/** What a call to the route came back with: an answer, a 404, or any other failure (network, timeout, 5xx). */
export type ParentRelationsAnswer = 'answered' | 'not-found' | 'failed'

/**
 * The API path of the parent relations of an element id (`w12`, `n3`, `r4`), relative to `/api/0.6/`'s host:
 * `/api/0.6/way/12/relations.json`. Undefined for an id that is not an OSM element (a new feature `n-1`).
 */
export function parentRelationsPath(id: string): string | undefined {
  const match = /^([nwr])(\d+)$/.exec(id)
  if (!match) return undefined
  const type = match[1] === 'n' ? 'node' : match[1] === 'w' ? 'way' : 'relation'
  return `/api/0.6/${type}/${match[2]}/relations.json`
}

/** Whether a call should be made now: not once the server has said it does not answer the route. */
export function shouldAskParentRelations(support: ParentRelationsSupport) {
  return support !== 'missing'
}

/**
 * The memory after a call: an answer means the route is supported; a 404 means it is missing for the session.
 * Any other failure leaves the memory as it was, so a network error does not switch the feature off.
 */
export function nextParentRelationsSupport(
  support: ParentRelationsSupport,
  answer: ParentRelationsAnswer,
): ParentRelationsSupport {
  if (answer === 'answered') return 'supported'
  if (answer === 'not-found') return 'missing'
  return support
}
