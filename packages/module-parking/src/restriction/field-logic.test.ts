import { describe, expect, test } from 'bun:test'
import {
  addRange,
  conditionFromEditor,
  EMPTY_EDITOR,
  editorFromCondition,
  setRangeEdge,
  toggleDay,
} from './condition-editor.ts'
import {
  addRule,
  conditionText,
  draftFromTags,
  planCommit,
  removeRule,
  ruleIssues,
  setPlain,
  setRaw,
  setRuleCondition,
  setRuleValue,
  writableRules,
  type FieldDraft,
} from './field-logic.ts'

const KEY = 'parking:right:restriction'
const COND = 'parking:right:restriction:conditional'

const draft = (plain: string, rules: FieldDraft['rules']): FieldDraft => ({
  plain,
  rules,
  raw: undefined,
})

describe('draftFromTags', () => {
  test('a plain value and its rules', () => {
    expect(
      draftFromTags(KEY, {
        [KEY]: 'no_stopping',
        [COND]: 'no_stopping @ (Mo-Fr 06:00-17:00); loading_only @ (Sa 10:00-12:00)',
      }),
    ).toEqual({
      plain: 'no_stopping',
      rules: [
        { id: 1, value: 'no_stopping', condition: 'Mo-Fr 06:00-17:00' },
        { id: 2, value: 'loading_only', condition: 'Sa 10:00-12:00' },
      ],
      raw: undefined,
    })
  })

  test('no tags is an empty draft', () => {
    expect(draftFromTags(KEY, {})).toEqual({ plain: '', rules: [], raw: undefined })
  })

  test('a stored rule without a condition or without a value is kept as raw, so no edit drops it', () => {
    expect(draftFromTags(KEY, { [COND]: 'no_stopping' })).toEqual({
      plain: '',
      rules: [],
      raw: 'no_stopping',
    })
    expect(draftFromTags(KEY, { [COND]: 'no_parking @ (Mo); @ (Sa)' }).raw).toBe(
      'no_parking @ (Mo); @ (Sa)',
    )
  })

  test('a text that is not canonical is kept whole as raw, with no rules', () => {
    const text = 'no_stopping @ (Mo-Fr 06:00-17:00);loading_only @ (Sa 10:00-12:00)'
    expect(draftFromTags(KEY, { [COND]: text })).toEqual({ plain: '', rules: [], raw: text })
  })
})

describe('the reducer', () => {
  test('adding a rule appends a blank one with a new id; the blank is not written', () => {
    const added = addRule(draft('', []))
    expect(added.rules).toEqual([{ id: 1, value: '', condition: '' }])
    expect(addRule(added).rules.map((rule) => rule.id)).toEqual([1, 2])
    expect(writableRules(added)).toEqual([])
    expect(conditionText(added)).toBe('')
  })

  test('removing a rule by id', () => {
    const rules = [
      { id: 1, value: 'no_parking', condition: '' },
      { id: 2, value: 'no_stopping', condition: 'Mo' },
    ]
    expect(removeRule(draft('', rules), 1).rules).toEqual([
      { id: 2, value: 'no_stopping', condition: 'Mo' },
    ])
  })

  test('changing a rule value and condition by id', () => {
    const start = draft('', [{ id: 1, value: 'no_stopping', condition: 'Mo-Fr 06:00-17:00' }])
    const changed = setRuleCondition(setRuleValue(start, 1, 'loading_only'), 1, 'Sa 07:00-10:00')
    expect(changed.rules).toEqual([{ id: 1, value: 'loading_only', condition: 'Sa 07:00-10:00' }])
    expect(conditionText(changed)).toBe('loading_only @ (Sa 07:00-10:00)')
  })

  test('a rule without a condition is not written: a value that always holds belongs in the plain key', () => {
    const waiting = draft('', [{ id: 1, value: 'no_stopping', condition: '' }])
    expect(conditionText(waiting)).toBe('')
    expect(ruleIssues(waiting)).toEqual([{ id: 1, issue: 'no-condition' }])
  })

  test('the weekday chips write the condition through the editor', () => {
    let condition = ''
    condition = conditionFromEditor(toggleDay(editorFromCondition(condition) ?? EMPTY_EDITOR, 'Mo'))
    expect(condition).toBe('Mo')
    let editor = addRange(editorFromCondition(condition) ?? EMPTY_EDITOR)
    condition = conditionFromEditor(editor)
    expect(condition).toBe('Mo 08:00-18:00')
    editor = setRangeEdge(editorFromCondition(condition) ?? EMPTY_EDITOR, 0, 'to', '16:00')
    condition = conditionFromEditor(editor)
    expect(condition).toBe('Mo 08:00-16:00')
    for (const day of ['Tu', 'We', 'Th', 'Fr'] as const) {
      condition = conditionFromEditor(
        toggleDay(editorFromCondition(condition) ?? EMPTY_EDITOR, day),
      )
    }
    expect(condition).toBe('Mo-Fr 08:00-16:00')
  })

  test('switching a rule to text and back loses nothing: the condition is the same text', () => {
    const condition = 'Mo-Fr 06:00-09:00,15:00-19:00'
    const editor = editorFromCondition(condition)
    expect(editor).toBeDefined()
    // the text mode edits nothing; the structured view reads the same text back
    expect(conditionFromEditor(editor ?? EMPTY_EDITOR)).toBe(condition)
    expect(editorFromCondition(condition)).toEqual(editor)
  })

  test('a condition the editor cannot show is kept as text, unchanged by other rules', () => {
    const text = 'Mo-Fr 06:00-16:00; Sa 07:00-16:00'
    const start = draft('', [
      { id: 1, value: 'loading_only', condition: text },
      { id: 2, value: 'no_stopping', condition: 'Su' },
    ])
    expect(editorFromCondition(text)).toBeUndefined()
    const next = setRuleValue(start, 2, 'no_parking')
    expect(next.rules[0]?.condition).toBe(text)
    expect(conditionText(next)).toBe(`loading_only @ (${text}); no_parking @ (Su)`)
  })

  test('the plain value', () => {
    expect(setPlain(draft('', []), 'no_parking').plain).toBe('no_parking')
  })

  test('a raw draft takes its text as typed and ignores rule changes', () => {
    const raw = { plain: '', rules: [], raw: 'no_stopping;loading_only' }
    expect(setRaw(raw, 'no_stopping; loading_only').raw).toBe('no_stopping; loading_only')
    expect(addRule(raw)).toBe(raw)
    expect(setRuleValue(raw, 1, 'x')).toBe(raw)
  })
})

describe('ruleIssues', () => {
  test('a rule with a condition and no value needs a value', () => {
    expect(ruleIssues(draft('', [{ id: 1, value: '', condition: 'Mo' }]))).toEqual([
      { id: 1, issue: 'no-value' },
    ])
  })

  test('a value may not hold the characters of the syntax or spaces at its edges', () => {
    expect(ruleIssues(draft('', [{ id: 1, value: 'no;stop', condition: '' }]))).toEqual([
      { id: 1, issue: 'bad-value' },
    ])
    expect(ruleIssues(draft('', [{ id: 1, value: 'no (stop', condition: '' }]))).toEqual([
      { id: 1, issue: 'bad-value' },
    ])
    expect(ruleIssues(draft('', [{ id: 1, value: ' no_stop', condition: '' }]))).toEqual([
      { id: 1, issue: 'bad-value' },
    ])
  })

  test('rules that read back alone but not together are one issue of the rules', () => {
    // "x @ (a()" reads back alone; joined with "; y" the open parenthesis swallows the separator
    expect(
      ruleIssues(
        draft('', [
          { id: 1, value: 'x', condition: 'a(' },
          { id: 2, value: 'y', condition: 'b' },
        ]),
      ),
    ).toEqual([{ id: undefined, issue: 'bad-rules' }])
  })

  test('a rule whose text does not read back alone is an issue of that rule', () => {
    expect(
      ruleIssues(
        draft('', [
          { id: 1, value: 'x', condition: 'a' },
          { id: 2, value: 'y @', condition: '' },
        ]),
      ),
    ).toEqual([{ id: 2, issue: 'bad-value' }])
  })

  test('valid rules and blank rows have no issues', () => {
    expect(
      ruleIssues(
        draft('', [
          { id: 1, value: 'no_stopping', condition: 'Mo-Fr 06:00-17:00' },
          { id: 2, value: '', condition: '' },
        ]),
      ),
    ).toEqual([])
  })

  test('a raw draft has no rule issues: the text is kept as written', () => {
    expect(ruleIssues({ plain: '', rules: [], raw: 'a;b' })).toEqual([])
  })
})

describe('planCommit: both keys in one change', () => {
  test('a plain value and a condition are two changes, one per key', () => {
    const plan = planCommit(
      draft('no_stopping', [{ id: 1, value: 'loading_only', condition: 'Sa 10:00-12:00' }]),
      KEY,
      {},
    )
    expect(plan).toEqual({
      ok: true,
      changes: [
        { key: KEY, value: 'no_stopping' },
        { key: COND, value: 'loading_only @ (Sa 10:00-12:00)' },
      ],
      issues: [],
    })
  })

  test('only the keys that change are written', () => {
    const tags = { [KEY]: 'no_stopping', [COND]: 'loading_only @ (Sa 10:00-12:00)' }
    const plan = planCommit(
      draft('no_stopping', [{ id: 1, value: 'loading_only', condition: 'Sa 10:00-12:00' }]),
      KEY,
      tags,
    )
    expect(plan.changes).toEqual([])
    expect(plan.ok).toBe(true)
  })

  test('empty values remove the keys', () => {
    const tags = { [KEY]: 'no_stopping', [COND]: 'loading_only @ (Sa 10:00-12:00)' }
    expect(planCommit(draft('', []), KEY, tags).changes).toEqual([
      { key: KEY, value: undefined },
      { key: COND, value: undefined },
    ])
  })

  test('a rule with a wrong value blocks the whole change: nothing is written', () => {
    const plan = planCommit(
      draft('no_stopping', [{ id: 1, value: 'a;b', condition: 'Mo' }]),
      KEY,
      {},
    )
    expect(plan.ok).toBe(false)
    expect(plan.changes).toEqual([])
    expect(plan.issues).toEqual([{ id: 1, issue: 'bad-value' }])
  })

  test('a half-filled rule waits and the rest is written', () => {
    const rules = [
      { id: 1, value: '', condition: 'Mo' },
      { id: 2, value: 'no_stopping', condition: '' },
      { id: 3, value: 'loading_only', condition: 'Sa' },
    ]
    const plan = planCommit(draft('no_parking', rules), KEY, {})
    expect(plan.ok).toBe(true)
    expect(plan.changes).toEqual([
      { key: KEY, value: 'no_parking' },
      { key: COND, value: 'loading_only @ (Sa)' },
    ])
    expect(plan.issues).toEqual([
      { id: 1, issue: 'no-value' },
      { id: 2, issue: 'no-condition' },
    ])
  })

  test('a raw text is written as it is when it changes', () => {
    const text = 'no_stopping;loading_only'
    const plan = planCommit({ plain: '', rules: [], raw: text }, KEY, {
      [COND]: 'no_stopping @ (Mo)',
    })
    expect(plan.ok).toBe(true)
    expect(plan.changes).toEqual([{ key: COND, value: text }])
  })

  test('the written text reads back as the same draft', () => {
    const start = draft('no_parking', [
      { id: 1, value: 'no_stopping', condition: 'Mo-Fr 06:00-09:00,15:00-19:00' },
      { id: 2, value: 'loading_only', condition: 'Mo-Sa 10:00-14:00' },
    ])
    const plan = planCommit(start, KEY, {})
    const written = Object.fromEntries(plan.changes.map((change) => [change.key, change.value]))
    expect(draftFromTags(KEY, written)).toEqual({
      plain: 'no_parking',
      rules: start.rules,
      raw: undefined,
    })
  })
})
