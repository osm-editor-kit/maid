/**
 * The shortcodes of MapRoulette instructions as tokens. A UI renders the tokens as its own controls, so there are
 * no HTML strings here.
 *
 *   [select "Label" name="field" values="a,b,c"]
 *   [checkbox "Label" name="field"]
 *   [copyable "text to copy"]
 *
 * The deprecated `{{{select ...}}}` forms are read too. A shortcode followed by `(` is a Markdown link and stays text.
 */

export type ShortcodeToken =
  | { type: 'text'; text: string }
  | { type: 'select'; label: string; name: string; values: string[] }
  | { type: 'checkbox'; label: string; name: string }
  | { type: 'copyable'; text: string }

/** The values of the form fields of a text: a string for a select (empty is no answer), a boolean for a checkbox */
export type ShortcodeResponses = Record<string, string | boolean>

const Q = '(?:&quot;|")'
const NOT_Q = '(?:(?!&quot;|").)*?'
const NOT_Q_GREEDY = '(?:(?!&quot;|").)*'
const OPEN = '(?:\\[|\\{\\{\\{)'
const CLOSE = '\\s*(?:\\]|\\}\\}\\})(?!\\()'

/** One regex with a named group per kind; created per call, because a global regex keeps its position */
function shortcodeRegex(): RegExp {
  const select = `select[/ ]?${Q}(?<sl>${NOT_Q})${Q}\\s+name=${Q}(?<sn>${NOT_Q})${Q}\\s+values=${Q}(?<sv>${NOT_Q})${Q}`
  const checkbox = `checkbox[/ ]?${Q}(?<cl>${NOT_Q})${Q}\\s+name=${Q}(?<cn>${NOT_Q})${Q}`
  const copyable = `copyable[/ ]?${Q}(?<ct>${NOT_Q_GREEDY})${Q}`
  return new RegExp(`${OPEN}(?:${select}|${checkbox}|${copyable})${CLOSE}`, 'gi')
}

/** Split a text into text and shortcode tokens. A `copyable` without text is dropped. */
export function parseShortcodes(text: string): ShortcodeToken[] {
  if (!text) return []
  const tokens: ShortcodeToken[] = []
  let last = 0
  const pushText = (end: number) => {
    if (end > last) tokens.push({ type: 'text', text: text.slice(last, end) })
  }
  for (const m of text.matchAll(shortcodeRegex())) {
    const g = m.groups ?? {}
    pushText(m.index)
    last = m.index + m[0].length
    if (g.sn !== undefined) {
      const values = (g.sv ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      tokens.push({ type: 'select', label: g.sl ?? '', name: g.sn, values })
    } else if (g.cn !== undefined) {
      tokens.push({ type: 'checkbox', label: g.cl ?? '', name: g.cn })
    } else if (g.ct) {
      tokens.push({ type: 'copyable', text: g.ct })
    }
  }
  pushText(text.length)
  return tokens
}

/** The form fields among the tokens: select and checkbox */
export function shortcodeFields(
  tokens: readonly ShortcodeToken[],
): Extract<ShortcodeToken, { type: 'select' | 'checkbox' }>[] {
  return tokens.filter(
    (t): t is Extract<ShortcodeToken, { type: 'select' | 'checkbox' }> =>
      t.type === 'select' || t.type === 'checkbox',
  )
}

/**
 * The completion responses to send from the raw values of the form: a select with an empty value is left out, a
 * checkbox is always there (false when not set). Names that no field has are dropped.
 */
export function completionResponsesFor(
  tokens: readonly ShortcodeToken[],
  values: Record<string, string | boolean | undefined>,
): ShortcodeResponses {
  const out: ShortcodeResponses = {}
  for (const field of shortcodeFields(tokens)) {
    const value = values[field.name]
    if (field.type === 'select') {
      if (typeof value === 'string' && value.trim()) out[field.name] = value.trim()
    } else {
      out[field.name] = value === true
    }
  }
  return out
}
