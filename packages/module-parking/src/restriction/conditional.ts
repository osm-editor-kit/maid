/** One part of a `*:conditional` tag: `no_parking @ (Mo-Fr 07:00-18:00)` is `{ value: 'no_parking', condition: 'Mo-Fr 07:00-18:00' }` */
export type ConditionalRule = { value: string; condition: string }

/** The rules of a `:conditional` value ("a @ (b); c @ d"). Stub: returns no rules until the restriction agent fills it in. */
export function parseConditional(text: string): ConditionalRule[] {
  void text
  return []
}

/** The `:conditional` value of rules, the inverse of parseConditional. Stub: returns '' until filled in. */
export function formatConditional(rules: ConditionalRule[]): string {
  void rules
  return ''
}
