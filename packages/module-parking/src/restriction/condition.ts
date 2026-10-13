/**
 * The structured reading of one condition inside the parentheses: `Mo-Fr 06:00-16:00; Sa 07:00-16:00`, `May-Oct: We[1]
 * 14:00-18:00`, `permit holder`, `stay > 2 hours`. Pure.
 *
 * The reading is only used when it writes back exactly: parseCondition returns the structure only when
 * formatCondition(structure) is the input again. Anything else (a comma between weekday groups, an unknown word, a
 * day list such as `Mo,We`) is `{ raw }` and stays as written. This is not an opening_hours parser: it covers the
 * patterns of qa-traffic-signs.md and a few neighbours.
 */

export type TimeRange = { from: string; to: string }
/** One weekday group: `days` is a day selector (`Mo-Fr`, `Sa`, `PH`, `We[1]`), absent for every day */
export type DayGroup = { days?: string; ranges: TimeRange[] }
export type TimeTerm = { kind: 'time'; months?: string; groups: DayGroup[] }
export type StayTerm = {
  kind: 'stay'
  op: '<' | '<=' | '>' | '>='
  amount: number
  unit: 'minute' | 'minutes' | 'hour' | 'hours'
}
export type PhraseTerm = { kind: 'phrase'; text: 'permit holder' }
export const VEHICLES = [
  'motorcar',
  'motorcycle',
  'bicycle',
  'hgv',
  'bus',
  'taxi',
  'emergency',
  'delivery',
] as const
/** A vehicle class in a condition. The class belongs in a key (`restriction:motorcar=none`), see the validation rules. */
export type VehicleTerm = { kind: 'vehicle'; vehicle: (typeof VEHICLES)[number] }
export type ConditionTerm = TimeTerm | StayTerm | PhraseTerm | VehicleTerm
/** The terms joined by ` AND `. An empty condition has no terms. */
export type ConditionParts = { terms: ConditionTerm[] }
export type RawCondition = { raw: string }

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su', 'PH'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
export type Month = (typeof MONTHS)[number]

/** The seven days of the week, Monday first; PH is not one of them (it is a day type) */
export const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const
const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su)'
const DAY_SELECTOR = `(?:${DAY}(?:-${DAY})?(?:\\[[1-5]\\])?|PH)`
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
const MONTH_SPAN = `${MONTH}(?:-${MONTH})?`
const TIME = '\\d{2}:\\d{2}-\\d{2}:\\d{2}'
const RANGES = `${TIME}(?:,${TIME})*`
const GROUP = new RegExp(`^(?:(${DAY_SELECTOR})(?: (${RANGES}))?|(${RANGES}))$`)
const MONTH_PREFIX = new RegExp(`^(${MONTH_SPAN}): (.+)$`)
const STAY = /^stay (<=|>=|<|>) (\d+) (minutes?|hours?)$/

/** The structure of a condition, or `{ raw }` when it is not understood or would not write back exactly */
export function parseCondition(condition: string): ConditionParts | RawCondition {
  const terms: ConditionTerm[] = []
  if (condition !== '') {
    for (const text of condition.split(' AND ')) {
      const term = parseTerm(text)
      if (term === undefined) return { raw: condition }
      terms.push(term)
    }
  }
  const parts: ConditionParts = { terms }
  return formatCondition(parts) === condition ? parts : { raw: condition }
}

/** The text of a condition: the inverse of parseCondition. Raw conditions are written back as they are. */
export function conditionText(value: ConditionParts | RawCondition): string {
  return 'raw' in value ? value.raw : formatCondition(value)
}

export function formatCondition(parts: ConditionParts): string {
  return parts.terms.map(formatTerm).join(' AND ')
}

export function isRawCondition(value: ConditionParts | RawCondition): value is RawCondition {
  return 'raw' in value
}

function parseTerm(text: string): ConditionTerm | undefined {
  const stay = STAY.exec(text)
  if (stay) {
    return {
      kind: 'stay',
      op: stay[1] as StayTerm['op'],
      amount: Number(stay[2]),
      unit: stay[3] as StayTerm['unit'],
    }
  }
  if (text === 'permit holder') return { kind: 'phrase', text }
  if ((VEHICLES as readonly string[]).includes(text)) {
    return { kind: 'vehicle', vehicle: text as VehicleTerm['vehicle'] }
  }
  return parseTimeTerm(text)
}

function parseTimeTerm(text: string): TimeTerm | undefined {
  const prefix = MONTH_PREFIX.exec(text)
  const body = prefix ? prefix[2]! : text
  const groups: DayGroup[] = []
  for (const part of body.split('; ')) {
    const match = GROUP.exec(part)
    if (!match) return undefined
    const group: DayGroup = { ranges: parseRanges(match[2] ?? match[3]) }
    if (match[1] !== undefined) group.days = match[1]
    groups.push(group)
  }
  const term: TimeTerm = { kind: 'time', groups }
  if (prefix) term.months = prefix[1]
  return term
}

function parseRanges(text: string | undefined): TimeRange[] {
  if (text === undefined) return []
  return text.split(',').map((range) => {
    const [from = '', to = ''] = range.split('-')
    return { from, to }
  })
}

function formatTerm(term: ConditionTerm): string {
  switch (term.kind) {
    case 'stay':
      return `stay ${term.op} ${term.amount} ${term.unit}`
    case 'phrase':
      return term.text
    case 'vehicle':
      return term.vehicle
    case 'time': {
      const groups = term.groups
        .map((group) => {
          const ranges = group.ranges.map((range) => `${range.from}-${range.to}`).join(',')
          return [group.days, ranges].filter((part): part is string => !!part).join(' ')
        })
        .join('; ')
      return term.months ? `${term.months}: ${groups}` : groups
    }
  }
}
