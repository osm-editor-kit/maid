import { describe, expect, test } from 'bun:test'
import { parseCondition } from './condition.ts'
import {
  formatConditional,
  isCanonicalConditional,
  parseConditional,
  splitOutsideParens,
} from './conditional.ts'

/**
 * The conditional expressions written out in full in qa-traffic-signs.md (line numbers in the comment).
 * The section 4.3 table counts 34 "explicit conditional expressions", but its counts include chain parts, repeats and
 * the eUVM lines; the document writes out 26 distinct well-formed expressions, listed here, and the malformed ones
 * below. Every tag line is copied from the document; the value is what follows the first "=".
 */
const EXPRESSIONS: { entry: string; line: string; reads: 'structured' | 'raw' | 'rejected' }[] = [
  {
    entry: '2 (l. 39)',
    line: 'parking:right:restriction:conditional=loading_only @ (Mo-Fr 06:00-16:00; Sa 07:00-16:00)',
    reads: 'structured',
  },
  { entry: '3 (l. 55)', line: 'access:conditional=no @ (09:00-18:00)', reads: 'structured' },
  {
    entry: '3 (l. 56)',
    line: 'disabled:conditional=designated @ (09:00-18:00)',
    reads: 'structured',
  },
  {
    entry: '5 (l. 97)',
    line: 'parking:right:restriction:conditional=no_stopping @ (Mo-Fr 06:00-17:00)',
    reads: 'structured',
  },
  {
    entry: '7 (l. 122)',
    line: 'parking:right:access:conditional=private @ (Fr 14:00-17:00)',
    reads: 'structured',
  },
  {
    entry: '8 (l. 138)',
    line: 'parking:SIDE:restriction:conditional=no_stopping @ (Mo-Fr 13:00-20:00)',
    reads: 'structured',
  },
  {
    entry: '8 option A, rejected (l. 141)',
    line: 'parking:side:restriction:conditional=no_stopping @ (Mo-Fr 00:00-13:00, 20:00-23:59)',
    reads: 'raw',
  },
  {
    entry: '8 option B, rejected (l. 141)',
    line: 'parking:side:restriction:conditional=none @ (Mo-Fr 13:00-20:00)',
    reads: 'structured',
  },
  {
    entry: '10 (l. 165)',
    line: 'parking:right:restriction:conditional=no_stopping @ (Mo-Fr 06:00-09:00,15:00-19:00)',
    reads: 'structured',
  },
  {
    entry: '13 (l. 206), chain of two rules',
    line: 'parking:left:restriction:conditional=no_stopping @ (Mo-Sa 07:00-20:00); loading_only @ (Mo-Sa 10:00-14:00)',
    reads: 'structured',
  },
  {
    entry: '14 (l. 220)',
    line: 'parking:right:restriction:conditional=loading_only @ (Mo-Fr 09:00-18:00)',
    reads: 'structured',
  },
  {
    entry: '15 (l. 235)',
    line: 'parking:right:fee:conditional=no @ (Mo-Sa 00:00-09:00; Su)',
    reads: 'structured',
  },
  {
    entry: '16 question, superseded (l. 260)',
    line: 'maxstay:conditional=4 hours @ (08:00-18:00)',
    reads: 'structured',
  },
  {
    entry: '16 superseded (l. 260)',
    line: 'restriction:conditional=charging_only @ (08:00-18:00)',
    reads: 'structured',
  },
  {
    entry: '17 eUVM, not confirmed (l. 269)',
    line: 'parking:both:fee:conditional=no @ (Mo-Sa 00:00-09:00; Su)',
    reads: 'structured',
  },
  {
    entry: '17 eUVM, not confirmed (l. 269)',
    line: 'parking:right:restriction:conditional=no_stopping @ (Mo-Fr 06:00-18:00)',
    reads: 'structured',
  },
  {
    entry: '18 lean (l. 276)',
    line: 'access:conditional=private @ (Fr 11:00-14:00)',
    reads: 'structured',
  },
  {
    entry: '18 rejected (l. 276)',
    line: 'access:conditional=no @ (Fr 11:00-14:00)',
    reads: 'structured',
  },
  {
    entry: '18 rejected (l. 276)',
    line: 'bus:conditional=designated @ (Fr 11:00-14:00)',
    reads: 'structured',
  },
  {
    entry: '18 (l. 280, 284)',
    line: 'parking:left:access:conditional=no @ (Mo-Fr 07:30-15:00)',
    reads: 'structured',
  },
  {
    entry: '18 open (l. 281)',
    line: 'parking:left:access:school_bus:conditional=designated @ (Mo-Fr 07:30-15:00)',
    reads: 'structured',
  },
  {
    entry: '18 open (l. 285)',
    line: 'parking:left:school_bus:conditional=designated @ (Mo-Fr 07:30-15:00)',
    reads: 'structured',
  },
  {
    entry: '18 first idea, replaced (l. 287)',
    line: 'parking:left:restriction:conditional=loading_only @ (Mo-Fr 07:30-15:00)',
    reads: 'structured',
  },
  {
    entry: '20 (l. 307)',
    line: 'maxstay:conditional=1 hour @ (Mo-Fr 09:00-18:00; Sa 09:00-14:00)',
    reads: 'structured',
  },
  {
    entry: '22 (l. 345)',
    line: 'parking:left:restriction:conditional=no_parking @ (Mo-Fr 06:00-18:00)',
    reads: 'structured',
  },
  {
    entry: '23 (l. 359)',
    line: 'restriction:conditional=no_stopping @ (May-Oct: We[1] 14:00-18:00)',
    reads: 'structured',
  },
]

/** Written in the document as expressions, but malformed or rejected in a way the parser has to hold */
const MALFORMED: { entry: string; line: string; note: string }[] = [
  {
    entry: '6 rejected (4.3 table, l. 500)',
    line: 'parking:right:fee:conditional=yes @ (Mo-Fr 09:00-18:00, Sa 09:00-14:00)',
    note: 'a comma between two weekday groups (rule V6): one group that does not read, so the condition stays raw',
  },
  {
    entry: '2 question, built from rule V6 (l. 516)',
    line: 'parking:right:restriction:conditional=loading_only @ (Mo-Fr 06:00-16:00, Sa 07:00-16:00)',
    note: 'the question form of entry 2 as rule V6 names it: a comma between weekday groups, stays raw',
  },
  {
    entry: '2 rejected (l. 45)',
    line: 'restriction:conditional=none @ loading',
    note: 'no parentheses: the whole segment is the value, written back as it is',
  },
  {
    entry: '22 rejected (l. 349)',
    line: 'parking:left:restriction:conditional=none @ motorcar',
    note: 'a vehicle class as a condition, no parentheses: the value keeps the text (rule V2 flags it)',
  },
  {
    entry: '2 "not documented" (l. 45)',
    line: 'parking:right:restriction:conditional=@ loading',
    note: 'an empty value before "@" and no parentheses: the value is the text, written back as it is',
  },
]

function valueOf(line: string): string {
  return line.slice(line.indexOf('=') + 1)
}

describe('the expressions of qa-traffic-signs.md', () => {
  test.each(EXPRESSIONS)('round-trips byte for byte: entry $entry', ({ line }) => {
    const value = valueOf(line)
    expect(isCanonicalConditional(value)).toBe(true)
    expect(formatConditional(parseConditional(value))).toBe(value)
  })

  test.each(MALFORMED)('keeps the text of a malformed source: entry $entry', ({ line }) => {
    const value = valueOf(line)
    expect(formatConditional(parseConditional(value))).toBe(value)
  })

  test('the count of expressions written out in the document', () => {
    expect(EXPRESSIONS).toHaveLength(26)
    expect(MALFORMED).toHaveLength(5)
  })

  test('the conditions read as structure, or stay raw where the source is not in the grammar', () => {
    for (const { line, reads } of EXPRESSIONS) {
      for (const rule of parseConditional(valueOf(line))) {
        const structured = !('raw' in parseCondition(rule.condition))
        expect([line, structured]).toEqual([line, reads !== 'raw'])
      }
    }
  })
})

describe('parseConditional and formatConditional', () => {
  test('rules are separated by ; outside parentheses', () => {
    expect(
      parseConditional('no_stopping @ (Mo-Sa 07:00-20:00); loading_only @ (Mo-Sa 10:00-14:00)'),
    ).toEqual([
      { value: 'no_stopping', condition: 'Mo-Sa 07:00-20:00' },
      { value: 'loading_only', condition: 'Mo-Sa 10:00-14:00' },
    ])
  })

  test('a ; and a , inside the parentheses belong to the condition', () => {
    expect(
      parseConditional('no_parking @ (Mo-Fr 00:00-13:00, 20:00-23:59; Sa 10:00-12:00)'),
    ).toEqual([
      { value: 'no_parking', condition: 'Mo-Fr 00:00-13:00, 20:00-23:59; Sa 10:00-12:00' },
    ])
  })

  test('a value without a condition is a rule with an empty condition', () => {
    expect(parseConditional('no_parking')).toEqual([{ value: 'no_parking', condition: '' }])
    expect(parseConditional('no_parking; loading_only @ (Su)')).toEqual([
      { value: 'no_parking', condition: '' },
      { value: 'loading_only', condition: 'Su' },
    ])
  })

  test('empty text is no rules, and no rules is empty text', () => {
    expect(parseConditional('')).toEqual([])
    expect(formatConditional([])).toBe('')
  })

  test('the rule with an empty value is written as @ (condition)', () => {
    expect(parseConditional('@ (Mo)')).toEqual([{ value: '', condition: 'Mo' }])
    expect(formatConditional([{ value: '', condition: 'Mo' }])).toBe('@ (Mo)')
  })

  test('a second @ inside the condition stays inside it', () => {
    const value = 'no_parking @ (a) @ (b)'
    expect(parseConditional(value)).toEqual([{ value: 'no_parking', condition: 'a) @ (b' }])
    expect(formatConditional(parseConditional(value))).toBe(value)
  })

  test('the canonical separator is "; ": other spacing is not canonical and the field marks it', () => {
    expect(isCanonicalConditional('a @ (Mo);b @ (Tu)')).toBe(false)
    expect(formatConditional(parseConditional('a @ (Mo);b @ (Tu)'))).toBe('a @ (Mo); b @ (Tu)')
    expect(isCanonicalConditional('a @ (Mo); b @ (Tu)')).toBe(true)
  })

  test('an unclosed parenthesis never splits the text', () => {
    expect(splitOutsideParens('a @ (Mo; b', ';')).toEqual(['a @ (Mo; b'])
    expect(parseConditional('a @ (Mo; b')).toEqual([{ value: 'a @ (Mo; b', condition: '' }])
  })

  test('a condition with a trailing or leading space is not canonical', () => {
    expect(isCanonicalConditional('a @ ( Mo)')).toBe(true)
    expect(isCanonicalConditional('a @ (Mo) ')).toBe(false)
    expect(isCanonicalConditional(' a @ (Mo)')).toBe(false)
  })
})
