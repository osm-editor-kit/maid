// Adopted from iD test/spec/util/clean_tags.js (ISC, © iD contributors), at commit 0194f3926.
// Titles, inputs and expected values are iD's. `discardTags` has tests of its own below.
import { describe, expect, it } from 'bun:test'
import { cleanTags, discardTags } from './clean-tags.ts'

describe('iD.utilCleanTags', () => {
  it('handles empty tags object', () => {
    const t = {}
    const result = cleanTags(t)
    expect(result).toEqual({})
  })

  it('discards empty keys', () => {
    const t = { '': 'bar' }
    const result = cleanTags(t)
    expect(result).toEqual({})
  })

  it('discards undefined values', () => {
    const t = { foo: undefined }
    const result = cleanTags(t)
    expect(result).toEqual({})
  })

  it('trims whitespace', () => {
    const t = {
      leading: '   value',
      trailing: 'value  ',
      both: '   value  ',
    }
    const result = cleanTags(t)
    expect(result).toEqual({
      leading: 'value',
      trailing: 'value',
      both: 'value',
    })
  })

  it('trims semicolon delimited whitespace', () => {
    const t = {
      leading: '   value1;  value2',
      trailing: 'value1  ;value2  ',
      both: '   value1  ;  value2  ',
    }
    const result = cleanTags(t)
    expect(result).toEqual({
      leading: 'value1;value2',
      trailing: 'value1;value2',
      both: 'value1;value2',
    })
  })

  it('does not clean description, note, fixme', () => {
    const t = {
      description: '   value',
      note: 'value  ',
      fixme: '   value  ',
    }
    const result = cleanTags(t)
    expect(result).toEqual(t)
  })

  it('uses semicolon-space delimiting for opening_hours, conditional: tags', () => {
    const t = {
      opening_hours:
        ' Mo-Su 08:00-18:00    ;Apr 10-15 off;Jun 08:00-14:00  ;  Aug off; Dec 25 off ',
      collection_times:
        '  Mo 10:00-12:00,12:30-15:00    ;Tu-Fr 08:00-12:00,12:30-15:00;Sa 08:00-12:00    ',
      'maxspeed:conditional': '    120 @ (06:00-20:00)   ;80 @ wet  ',
      'restriction:conditional': '  no_u_turn @ (Mo-Fr 09:00-10:00,15:00-16:00;SH off)  ',
    }
    const result = cleanTags(t)
    expect(result).toEqual({
      opening_hours: 'Mo-Su 08:00-18:00; Apr 10-15 off; Jun 08:00-14:00; Aug off; Dec 25 off',
      collection_times: 'Mo 10:00-12:00,12:30-15:00; Tu-Fr 08:00-12:00,12:30-15:00; Sa 08:00-12:00',
      'maxspeed:conditional': '120 @ (06:00-20:00); 80 @ wet',
      'restriction:conditional': 'no_u_turn @ (Mo-Fr 09:00-10:00,15:00-16:00; SH off)',
    })
  })
})

describe('discardTags', () => {
  it('drops keys with an empty value, which iD does not upload either', () => {
    expect(discardTags({ name: '', amenity: 'cafe' })).toEqual({ amenity: 'cafe' })
  })

  it('drops a listed value only, when the discard list gives values (iD shape)', () => {
    const discarded = { attribution: { 'https://example.com': true }, created_by: true }
    expect(
      discardTags(
        { attribution: 'https://example.com', created_by: 'Potlatch', name: 'Cafe' },
        discarded,
      ),
    ).toEqual({ name: 'Cafe' })
    expect(discardTags({ attribution: 'other' }, discarded)).toEqual({ attribution: 'other' })
  })
})
