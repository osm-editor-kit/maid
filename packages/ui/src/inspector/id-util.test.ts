// Adopted from iD test/spec/util/clean_tags.js (ISC, © iD contributors), at commit 0194f3926.
// iD cleans a whole tags object (utilCleanTags); Maid cleans each value as it is written (cleanValue),
// so the value-level test is adopted here against cleanValue. The rest of clean_tags is in
// packages/model/test/id/util/clean_tags.test.ts as todo (F-util-2).
import { describe, expect, it } from 'bun:test'
import { cleanValue } from './logic.ts'

describe('iD.utilCleanTags', () => {
  it('trims whitespace', () => {
    const t = {
      leading: '   value',
      trailing: 'value  ',
      both: '   value  ',
    }
    const result = Object.fromEntries(
      Object.entries(t).map(([key, value]) => [key, cleanValue(value)]),
    )
    expect(result).toEqual({
      leading: 'value',
      trailing: 'value',
      both: 'value',
    })
  })
})
