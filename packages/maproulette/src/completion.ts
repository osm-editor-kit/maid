/** The rules around finishing a task: the buttons, the comment, when the status is sent, and what an error means */
import { TaskStatus, type TaskStatusCode } from './status.ts'

/** The longest comment MapRoulette takes from the finish form */
export const COMMENT_MAX_LENGTH = 1000

/** When the status goes to MapRoulette: after the OSM upload, or at once */
export type UpdateTiming = 'with_save' | 'right_away'

/** The finish buttons, in the order of MapRoulette V4 (two by two) */
export const COMPLETION_ACTIONS: readonly {
  key: 'fixed' | 'alreadyFixed' | 'notAnIssue' | 'cantComplete'
  status: TaskStatusCode
}[] = [
  { key: 'fixed', status: TaskStatus.Fixed },
  { key: 'alreadyFixed', status: TaskStatus.AlreadyFixed },
  { key: 'notAnIssue', status: TaskStatus.FalsePositive },
  { key: 'cantComplete', status: TaskStatus.TooHard },
]

/** A stored value as a timing; anything but `right_away` is `with_save` */
export function parseUpdateTiming(raw: unknown): UpdateTiming {
  return raw === 'right_away' ? 'right_away' : 'with_save'
}

/** A tag fix is always sent with the save (the edit and the status go together) */
export function effectiveUpdateTiming(isTagFix: boolean, stored: UpdateTiming): UpdateTiming {
  return isTagFix ? 'with_save' : stored
}

/** Whether the comment is too long to send */
export function isCommentTooLong(text: string | null | undefined): boolean {
  return String(text || '').length > COMMENT_MAX_LENGTH
}

/** The comment field is hidden with the save, so what is left in it is not sent */
export function shouldClearHiddenComment(timing: UpdateTiming): boolean {
  return timing === 'with_save'
}

/** The responses when there are any; undefined for none */
export function stripEmptyCompletionResponses<T extends Record<string, unknown>>(
  responses: T | null | undefined,
): T | undefined {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return undefined
  return Object.keys(responses).length ? responses : undefined
}

/** Whether the Fixed button is hidden: a tag fix that is ready shows Accept instead */
export function shouldHideFixedAction(tagFixReady: boolean, tagFixHasAccept: boolean): boolean {
  return tagFixReady && tagFixHasAccept
}

/** Whether an error is a sign-in error: a MapRouletteError, or anything with status 401 or a NotAuthorized body */
export function isAuthError(error: unknown): boolean {
  const e = error as
    | { kind?: string; status?: number; body?: { status?: string } | null }
    | null
    | undefined
  return (
    !!e && (e.kind === 'unauthorized' || e.status === 401 || e.body?.status === 'NotAuthorized')
  )
}

/** The classes of a failed submit that the UI words differently */
export type SubmitErrorKind = 'timeout' | 'inflight' | 'http' | 'network' | 'generic'

/** The class of an error of the client */
export function classifySubmitError(error: unknown): SubmitErrorKind {
  const e = error as { kind?: string; status?: number } | null | undefined
  if (!e) return 'generic'
  if (e.kind === 'timeout') return 'timeout'
  if (e.kind === 'inflight') return 'inflight'
  if (e.kind === 'unauthorized' || e.kind === 'http') return 'http'
  if (e.kind === 'network') return 'network'
  return 'generic'
}

function entityRank(id: string): number {
  const c = id.charAt(0)
  return c === 'w' ? 0 : c === 'n' ? 1 : c === 'r' ? 2 : 3
}

/** The entity to show first: ways before nodes before relations */
export function preferredShowOsmId(elems: readonly string[]): string | null {
  return [...elems].sort((a, b) => entityRank(a) - entityRank(b))[0] ?? null
}
