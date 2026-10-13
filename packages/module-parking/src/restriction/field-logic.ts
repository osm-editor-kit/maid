/**
 * The draft of a conditional field: the plain value and its rules, as the field edits them, and the plan that writes
 * both keys as one change. Pure: no React, no DOM.
 *
 * The field's key is the plain key (`parking:right:restriction`); its rules are in `<key>:conditional`. A text that
 * is not in the canonical form (see isCanonicalConditional), or that has a rule without a value or without a
 * condition, is not split into rules: it is kept as `raw`, shown as written and marked, and never rewritten or dropped.
 *
 * A rule is written once it has a value and a condition. A value that always holds is not a conditional: it belongs in
 * the plain key, so a row with a value and no condition waits (it is marked, and the rest of the draft is written).
 */
import {
  formatConditional,
  isCanonicalConditional,
  parseConditional,
  type ConditionalRule,
} from './conditional.ts'

export type RuleDraft = { id: number; value: string; condition: string }
export type FieldDraft = {
  /** The plain value; '' is not set */
  plain: string
  rules: RuleDraft[]
  /** Set when the stored `:conditional` text is not canonical: the whole text, as written */
  raw: string | undefined
}
export type TagChange = { key: string; value: string | undefined }
export type RuleIssue =
  /** The row has a condition and waits for its value: not written yet */
  | 'no-value'
  /** The row has a value and waits for its condition: not written yet */
  | 'no-condition'
  | 'bad-value'
  | 'bad-condition'
  /** The rules as a whole do not read back the same (for example an unbalanced parenthesis between two rules) */
  | 'bad-rules'
export type IssueAt = { id: number | undefined; issue: RuleIssue }
export type CommitPlan = { ok: boolean; changes: TagChange[]; issues: IssueAt[] }

/** The issues of a row that is not finished: the row is left out of the write, the rest is written */
const WAITING: ReadonlySet<RuleIssue> = new Set(['no-value', 'no-condition'])

/** Whether an issue stops the write of the whole draft (a waiting row does not) */
export function blocksCommit(issue: RuleIssue): boolean {
  return !WAITING.has(issue)
}

type Tags = Readonly<Record<string, string | undefined>>

export function conditionalKeyOf(key: string): string {
  return `${key}:conditional`
}

/** The draft of the tags: the plain value and the rules, or the raw text when the rules text is not canonical */
export function draftFromTags(key: string, tags: Tags): FieldDraft {
  const plain = tags[key] ?? ''
  const text = tags[conditionalKeyOf(key)] ?? ''
  const parsed = parseConditional(text)
  const whole = parsed.every((rule) => rule.value !== '' && rule.condition !== '')
  if (!whole || !isCanonicalConditional(text)) return { plain, rules: [], raw: text }
  return { plain, rules: parsed.map((rule, index) => ({ id: index + 1, ...rule })), raw: undefined }
}

export function setPlain(draft: FieldDraft, plain: string): FieldDraft {
  return { ...draft, plain }
}

/** A new rule with no value and no condition: it is not written until it has both */
export function addRule(draft: FieldDraft): FieldDraft {
  if (draft.raw !== undefined) return draft
  const id = draft.rules.reduce((highest, rule) => Math.max(highest, rule.id), 0) + 1
  return { ...draft, rules: [...draft.rules, { id, value: '', condition: '' }] }
}

export function removeRule(draft: FieldDraft, id: number): FieldDraft {
  return { ...draft, rules: draft.rules.filter((rule) => rule.id !== id) }
}

export function setRuleValue(draft: FieldDraft, id: number, value: string): FieldDraft {
  return updateRule(draft, id, { value })
}

export function setRuleCondition(draft: FieldDraft, id: number, condition: string): FieldDraft {
  return updateRule(draft, id, { condition })
}

/** Replaces the whole text of a raw draft. Kept as typed until it is written. */
export function setRaw(draft: FieldDraft, raw: string): FieldDraft {
  return { ...draft, raw }
}

function updateRule(draft: FieldDraft, id: number, patch: Partial<RuleDraft>): FieldDraft {
  if (draft.raw !== undefined) return draft
  return {
    ...draft,
    rules: draft.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
  }
}

/** The rules that are data: the ones with a value and a condition. A blank or half-filled row is not written. */
export function writableRules(draft: FieldDraft): ConditionalRule[] {
  return draft.rules
    .filter((rule) => rule.value !== '' && rule.condition !== '')
    .map(({ value, condition }) => ({ value, condition }))
}

/** The `:conditional` text the draft writes */
export function conditionText(draft: FieldDraft): string {
  return draft.raw !== undefined ? draft.raw : formatConditional(writableRules(draft))
}

/**
 * What is wrong with each rule of the draft. A waiting row (`no-value`, `no-condition`) is only left out of the write;
 * any other issue stops the write of the whole draft (blocksCommit).
 */
export function ruleIssues(draft: FieldDraft): IssueAt[] {
  if (draft.raw !== undefined) return []
  const issues: IssueAt[] = []
  for (const rule of draft.rules) {
    if (rule.value === '' && rule.condition === '') continue
    if (rule.value === '') issues.push({ id: rule.id, issue: 'no-value' })
    else if (rule.value !== rule.value.trim() || /[;@()]/.test(rule.value))
      issues.push({ id: rule.id, issue: 'bad-value' })
    else if (rule.condition === '') issues.push({ id: rule.id, issue: 'no-condition' })
    else if (!readsBackAlone(rule)) issues.push({ id: rule.id, issue: 'bad-condition' })
  }
  if (issues.some((found) => blocksCommit(found.issue))) return issues
  const rules = writableRules(draft)
  const back = parseConditional(formatConditional(rules))
  const same =
    back.length === rules.length && back.every((rule, index) => sameRule(rule, rules[index]))
  return same ? issues : [...issues, { id: undefined, issue: 'bad-rules' }]
}

/**
 * The write of a draft over the tags: both keys, only the ones that change, to be written as one change. Blocked
 * (ok false, no changes) while an issue stops it; the issues say which. Waiting rows are in `issues` too.
 */
export function planCommit(draft: FieldDraft, key: string, tags: Tags): CommitPlan {
  const issues = ruleIssues(draft)
  if (issues.some((found) => blocksCommit(found.issue))) return { ok: false, changes: [], issues }
  const changes: TagChange[] = []
  const plain = draft.plain.trim() === '' ? undefined : draft.plain.trim()
  if (plain !== (tags[key] || undefined)) changes.push({ key, value: plain })
  const condKey = conditionalKeyOf(key)
  const text = conditionText(draft) === '' ? undefined : conditionText(draft)
  if (text !== (tags[condKey] || undefined)) changes.push({ key: condKey, value: text })
  return { ok: true, changes, issues }
}

function readsBackAlone(rule: RuleDraft): boolean {
  const back = parseConditional(
    formatConditional([{ value: rule.value, condition: rule.condition }]),
  )
  return back.length === 1 && sameRule(back[0], rule)
}

function sameRule(a: ConditionalRule | undefined, b: ConditionalRule | undefined): boolean {
  return a !== undefined && b !== undefined && a.value === b.value && a.condition === b.condition
}
