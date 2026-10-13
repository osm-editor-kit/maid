/**
 * The state of the compact condition editor (weekday chips, time ranges, months) and its conversion to and from a
 * condition text. Pure. The editor can show only one shape: one time term with the same time ranges for all its
 * days. Anything else is edited as text (editorFromCondition gives undefined).
 */
import {
  DAY_NAMES,
  formatCondition,
  parseCondition,
  WEEKDAYS,
  type DayGroup,
  type TimeRange,
  type TimeTerm,
  type Weekday,
} from './condition.ts'

export type EditorState = {
  /** The chosen weekdays in week order (PH last). None chosen means every day. */
  days: Weekday[]
  /** The time ranges every chosen day has. None means all day. */
  ranges: TimeRange[]
  /** '' for none, one month ('May') or a span ('May-Oct') */
  months: string
}

export const EMPTY_EDITOR: EditorState = { days: [], ranges: [], months: '' }

/** The editor's state for a condition text, or undefined when the text is not one time term the editor can show */
export function editorFromCondition(condition: string): EditorState | undefined {
  if (condition === '') return EMPTY_EDITOR
  const parsed = parseCondition(condition)
  if ('raw' in parsed || parsed.terms.length !== 1) return undefined
  const term = parsed.terms[0]
  if (term?.kind !== 'time') return undefined
  const ranges = term.groups[0]?.ranges ?? []
  const rangesKey = JSON.stringify(ranges)
  const days = new Set<Weekday>()
  for (const group of term.groups) {
    if (JSON.stringify(group.ranges) !== rangesKey) return undefined
    if (group.days === undefined) {
      if (term.groups.length !== 1) return undefined
      continue
    }
    const expanded = expandDays(group.days)
    if (expanded === undefined) return undefined
    for (const day of expanded) days.add(day)
  }
  return {
    days: WEEKDAYS.filter((day) => days.has(day)),
    ranges,
    months: term.months ?? '',
  }
}

/**
 * The condition text of the editor's state. Months are written only with a day or a time (the editor keeps the
 * months control disabled otherwise); with neither the condition is empty.
 */
export function conditionFromEditor(state: EditorState): string {
  if (state.days.length === 0 && state.ranges.length === 0) return ''
  const groups: DayGroup[] = daySelectors(state.days).map((days) =>
    days === undefined ? { ranges: state.ranges } : { days, ranges: state.ranges },
  )
  const term: TimeTerm = { kind: 'time', groups }
  if (state.months !== '') term.months = state.months
  return formatCondition({ terms: [term] })
}

/** Toggles one weekday; the list stays in week order */
export function toggleDay(state: EditorState, day: Weekday): EditorState {
  const days = state.days.includes(day)
    ? state.days.filter((chosen) => chosen !== day)
    : WEEKDAYS.filter((candidate) => candidate === day || state.days.includes(candidate))
  return { ...state, days, months: monthsAllowed({ ...state, days }) ? state.months : '' }
}

/** Sets one edge of a range. An empty value is ignored: a time cannot be cleared to nothing. */
export function setRangeEdge(
  state: EditorState,
  index: number,
  edge: 'from' | 'to',
  value: string,
): EditorState {
  if (value === '') return state
  return {
    ...state,
    ranges: state.ranges.map((range, position) =>
      position === index ? { ...range, [edge]: value } : range,
    ),
  }
}

export function addRange(state: EditorState): EditorState {
  return { ...state, ranges: [...state.ranges, { from: '08:00', to: '18:00' }] }
}

export function removeRange(state: EditorState, index: number): EditorState {
  const ranges = state.ranges.filter((_, position) => position !== index)
  return { ...state, ranges, months: monthsAllowed({ ...state, ranges }) ? state.months : '' }
}

/** The months control is usable only where the condition has a day or a time */
export function monthsAllowed(state: EditorState): boolean {
  return state.days.length > 0 || state.ranges.length > 0
}

/** The two ends of the months: '' means none. One month: both ends are the same month. */
export function monthEnds(state: EditorState): { from: string; to: string } {
  const [from = '', to = from] = state.months.split('-')
  return { from, to }
}

/** Sets one end of the months; an empty start means no months, an empty end means the start only */
export function setMonthEdge(state: EditorState, edge: 'from' | 'to', value: string): EditorState {
  const current = monthEnds(state)
  const next = { ...current, [edge]: value }
  const months =
    next.from === ''
      ? ''
      : next.to === '' || next.to === next.from
        ? next.from
        : `${next.from}-${next.to}`
  return { ...state, months }
}

/** The selectors of the chosen days: runs of days as `Mo-Fr`, PH on its own. No days: one group without a day. */
function daySelectors(days: readonly Weekday[]): (string | undefined)[] {
  if (days.length === 0) return [undefined]
  const selectors: string[] = []
  let start = -1
  for (let index = 0; index <= DAY_NAMES.length; index++) {
    const name = DAY_NAMES[index]
    const on = name !== undefined && days.includes(name)
    if (on && start < 0) start = index
    if (!on && start >= 0) {
      const first = DAY_NAMES[start]
      const last = DAY_NAMES[index - 1]
      selectors.push(start === index - 1 ? `${first}` : `${first}-${last}`)
      start = -1
    }
  }
  if (days.includes('PH')) selectors.push('PH')
  return selectors
}

/** The weekdays a day selector stands for. Undefined for a selector the editor does not show (nth weekdays, reversed ranges). */
function expandDays(selector: string): Weekday[] | undefined {
  if (selector === 'PH') return ['PH']
  if (selector.includes('[')) return undefined
  const [first, last = first] = selector.split('-')
  const start = DAY_NAMES.findIndex((day) => day === first)
  const end = DAY_NAMES.findIndex((day) => day === last)
  if (start < 0 || end < start) return undefined
  return DAY_NAMES.slice(start, end + 1)
}
