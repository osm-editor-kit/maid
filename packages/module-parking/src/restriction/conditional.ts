/** One part of a `*:conditional` tag: `no_parking @ (Mo-Fr 07:00-18:00)` is `{ value: 'no_parking', condition: 'Mo-Fr 07:00-18:00' }` */
export type ConditionalRule = { value: string; condition: string }

/**
 * The rules of a `:conditional` value: `value @ (condition); value2 @ (condition2)`.
 *
 * - Rules are separated by `;` outside parentheses. A `;` or `,` inside the parentheses belongs to the condition.
 * - A rule without " @ (" is a value without a condition (`condition` is '').
 * - Pure and total: nothing is cut or rejected. A segment that does not fit the pattern is kept whole as its value,
 *   so formatConditional gives the text back. Text that is not in the canonical form (see isCanonicalConditional)
 *   does not come back byte for byte; the field keeps such text as written and marks it.
 */
export function parseConditional(text: string): ConditionalRule[] {
  if (text === '') return []
  return splitOutsideParens(text, ';').map(parseRule)
}

/**
 * The `:conditional` value of rules, the inverse of parseConditional. The canonical separator is `; `, the
 * canonical rule is `value @ (condition)`. A rule with an empty value and a condition is written `@ (condition)`.
 */
export function formatConditional(rules: ConditionalRule[]): string {
  return rules.map(formatRule).join('; ')
}

/** True when the text is exactly what formatConditional writes for its rules: the text round-trips byte for byte. */
export function isCanonicalConditional(text: string): boolean {
  return formatConditional(parseConditional(text)) === text
}

const OPEN = ' @ ('

function parseRule(segment: string): ConditionalRule {
  const rule = segment.trim()
  const at = rule.indexOf(OPEN)
  if (at >= 0 && rule.endsWith(')')) {
    return { value: rule.slice(0, at), condition: rule.slice(at + OPEN.length, -1) }
  }
  // "@ (x)" with the value left out
  if (rule.startsWith('@ (') && rule.endsWith(')')) {
    return { value: '', condition: rule.slice(3, -1) }
  }
  return { value: rule, condition: '' }
}

function formatRule(rule: ConditionalRule): string {
  if (rule.condition === '') return rule.value
  return rule.value === '' ? `@ (${rule.condition})` : `${rule.value} @ (${rule.condition})`
}

/**
 * Splits at `separator` where the parentheses are closed. Unbalanced parentheses never split: the text after an
 * unclosed "(" stays one piece, so the parts are never cut inside a condition.
 */
export function splitOutsideParens(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '(') depth++
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}
