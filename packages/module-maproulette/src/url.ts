/**
 * The `maproulette` URL parameter: the open challenge, and the current task after a slash (`maproulette=9001` or
 * `maproulette=9001/190003`), so a link opens a challenge or a task. iD's fork reads `maproulette=` in the hash with a
 * list of challenge ids; Maid opens one challenge at a time and takes the first of such a list.
 */
import type { UrlParser } from '@osm-editor-kit/maid-core'

/** The name of the parameter */
export const MAPROULETTE_PARAM = 'maproulette'

export type MapRouletteLink = { challengeId: string | null; taskId: string | null }

const ID = /^[1-9][0-9]{0,15}$/

/** `9001`, `9001/190003`, `/190003` (a task of any challenge), or iD's `9001,9002` (the first one) */
export const parseAsMapRouletteLink: UrlParser<MapRouletteLink> = {
  parse(value) {
    const [first = '', task = ''] = value.trim().split('/')
    const challenge = first.split(',')[0]?.trim() ?? ''
    const challengeId = ID.test(challenge) ? challenge : null
    const taskId = ID.test(task.trim()) ? task.trim() : null
    return challengeId === null && taskId === null ? null : { challengeId, taskId }
  },
  serialize: (link) =>
    link.taskId === null ? (link.challengeId ?? '') : `${link.challengeId ?? ''}/${link.taskId}`,
  eq: (a, b) => a.challengeId === b.challengeId && a.taskId === b.taskId,
}

/**
 * A challenge id from what the person typed in the panel: the number, or a link to a challenge or a task on
 * MapRoulette's website (`…/browse/challenges/9001`, `…/challenge/9001/task/190003`).
 */
export function challengeOfInput(text: string): MapRouletteLink | null {
  const value = text.trim()
  if (ID.test(value)) return { challengeId: value, taskId: null }
  const task = /challenges?\/(\d+)\/task\/(\d+)/.exec(value)
  if (task?.[1] && task[2]) return { challengeId: task[1], taskId: task[2] }
  const challenge = /challenges?\/(\d+)/.exec(value)
  if (challenge?.[1]) return { challengeId: challenge[1], taskId: null }
  return null
}
