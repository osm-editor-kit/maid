/**
 * The `tm` URL parameter: a Tasking Manager project, and one of its tasks after a slash (`tm=1234` or `tm=1234/56`), so
 * a link opens the project at that task. A link to the TM's own pages (`…/projects/1234/tasks`) is read too, for a
 * person who pastes one.
 */
import type { UrlParser } from '@osm-editor-kit/maid-core'

/** The name of the parameter */
export const TM_PARAM = 'tm'

export type TmLink = { projectId: number; taskId: number | null }

const ID = /^[1-9][0-9]{0,9}$/

/** `1234`, `1234/56`, or a TM link with `/projects/1234` */
export function parseTmLink(value: string): TmLink | null {
  const trimmed = value.trim()
  const fromSite = /projects\/(\d+)/.exec(trimmed)
  const [project = '', task = ''] = fromSite?.[1] ? [fromSite[1]] : trimmed.split('/')
  if (!ID.test(project)) return null
  return { projectId: Number(project), taskId: ID.test(task.trim()) ? Number(task.trim()) : null }
}

export const parseAsTmLink: UrlParser<TmLink> = {
  parse: parseTmLink,
  serialize: (link) =>
    link.taskId === null ? `${link.projectId}` : `${link.projectId}/${link.taskId}`,
  eq: (a, b) => a.projectId === b.projectId && a.taskId === b.taskId,
}
