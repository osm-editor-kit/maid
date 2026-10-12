import { describe, expect, it } from 'bun:test'
import {
  colourToHex,
  identifierLink,
  isValidDate,
  isValidUrl,
  pickerDate,
  showsSetToday,
  telKey,
  todayIso,
} from './text-logic.ts'

describe('isValidUrl', () => {
  it('accepts http and https URLs with a host', () => {
    expect(isValidUrl('https://example.org')).toBe(true)
    expect(isValidUrl('http://example.org/a?b=c')).toBe(true)
    expect(isValidUrl('  https://example.org  ')).toBe(true)
  })
  it('rejects other schemes, bare hosts and broken URLs', () => {
    expect(isValidUrl('example.org')).toBe(false)
    expect(isValidUrl('ftp://example.org')).toBe(false)
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
    expect(isValidUrl('https://')).toBe(false)
    expect(isValidUrl('https://exa mple.org')).toBe(false)
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('   ')).toBe(false)
  })
})

describe('identifierLink', () => {
  const field = {
    urlFormat: 'https://www.mapillary.com/app/?pKey={value}',
    pattern: '[0-9]+',
  }
  it('puts the first match of the pattern into {value}', () => {
    expect(identifierLink(field, '12345')).toBe('https://www.mapillary.com/app/?pKey=12345')
    expect(identifierLink(field, 'id 987 and 654')).toBe('https://www.mapillary.com/app/?pKey=987')
  })
  it('uses the value itself when it already is a URL', () => {
    expect(identifierLink(field, 'https://example.org/x')).toBe('https://example.org/x')
  })
  it('gives nothing when the value does not match the pattern', () => {
    expect(identifierLink(field, 'abc')).toBeUndefined()
  })
  it('gives nothing for an empty value, a missing format or a bad pattern', () => {
    expect(identifierLink(field, '   ')).toBeUndefined()
    expect(identifierLink({ pattern: '[0-9]+' }, '12')).toBeUndefined()
    expect(identifierLink({ urlFormat: 'https://x/{value}' }, '12')).toBeUndefined()
    expect(identifierLink({ urlFormat: 'https://x/{value}', pattern: '(' }, '12')).toBeUndefined()
  })
  it('encodes the matched id', () => {
    expect(identifierLink({ urlFormat: 'https://x/{value}', pattern: '.+' }, 'a b/c')).toBe(
      'https://x/a%20b%2Fc',
    )
  })
})

describe('telKey', () => {
  const field = { key: 'phone', keys: ['phone', 'contact:phone'] }
  it('writes to key when no key has a value', () => {
    expect(telKey(field, {})).toBe('phone')
  })
  it('writes to the key that has a value', () => {
    expect(telKey(field, { 'contact:phone': '+49 30 1' })).toBe('contact:phone')
  })
  it('keeps key when both have a value', () => {
    expect(telKey(field, { phone: '+1', 'contact:phone': '+2' })).toBe('phone')
  })
  it('uses the first of keys when there is no key', () => {
    expect(telKey({ keys: ['phone', 'contact:phone'] }, {})).toBe('phone')
    expect(telKey({ keys: ['phone', 'contact:phone'] }, { 'contact:phone': '1' })).toBe(
      'contact:phone',
    )
  })
  it('gives nothing without any key', () => {
    expect(telKey({}, {})).toBeUndefined()
  })
})

describe('isValidDate', () => {
  it('accepts YYYY, YYYY-MM and YYYY-MM-DD', () => {
    expect(isValidDate('2024')).toBe(true)
    expect(isValidDate('2024-01')).toBe(true)
    expect(isValidDate('2024-01-31')).toBe(true)
    expect(isValidDate('2024-02-29')).toBe(true)
  })
  it('rejects a month without a leading zero and a month over 12', () => {
    expect(isValidDate('2024-1')).toBe(false)
    expect(isValidDate('2024-13-01')).toBe(false)
    expect(isValidDate('2024-00')).toBe(false)
  })
  it('rejects days that do not exist in the month', () => {
    expect(isValidDate('2024-02-30')).toBe(false)
    expect(isValidDate('2023-02-29')).toBe(false)
    expect(isValidDate('2024-04-31')).toBe(false)
    expect(isValidDate('2024-01-00')).toBe(false)
  })
  it('rejects other shapes', () => {
    expect(isValidDate('')).toBe(false)
    expect(isValidDate('24-01-01')).toBe(false)
    expect(isValidDate('2024/01/01')).toBe(false)
    expect(isValidDate('last week')).toBe(false)
  })
})

describe('pickerDate', () => {
  it('passes a whole date through and empties the rest', () => {
    expect(pickerDate('2024-01-05')).toBe('2024-01-05')
    expect(pickerDate('2024-01')).toBe('')
    expect(pickerDate('2024')).toBe('')
    expect(pickerDate('2024-02-30')).toBe('')
  })
})

describe('todayIso', () => {
  it('gives the local calendar date', () => {
    expect(todayIso(new Date(2024, 0, 5, 12))).toBe('2024-01-05')
    expect(todayIso(new Date(2024, 11, 31, 23, 59))).toBe('2024-12-31')
  })
})

describe('showsSetToday', () => {
  const today = '2024-01-05'
  it('shows for check_date and survey:date when the text is not today', () => {
    expect(showsSetToday('check_date', '', today)).toBe(true)
    expect(showsSetToday('survey:date', '2020', today)).toBe(true)
    expect(showsSetToday('check_date', today, today)).toBe(false)
  })
  it('does not show for other dates', () => {
    expect(showsSetToday('opening_date', '', today)).toBe(false)
    expect(showsSetToday(undefined, '', today)).toBe(false)
  })
})

describe('colourToHex', () => {
  it('reads hex with three or six digits', () => {
    expect(colourToHex('#F00')).toBe('#ff0000')
    expect(colourToHex('#00Ff7f')).toBe('#00ff7f')
  })
  it('needs the # of a hex colour', () => {
    expect(colourToHex('ff0000')).toBeUndefined()
    expect(colourToHex('#ff00')).toBeUndefined()
    expect(colourToHex('#gg0000')).toBeUndefined()
  })
  it('reads the basic colour names, any case, spaces ignored', () => {
    expect(colourToHex('Red')).toBe('#ff0000')
    expect(colourToHex(' blue ')).toBe('#0000ff')
    expect(colourToHex('grey')).toBe('#808080')
  })
  it('gives nothing for other text, including prototype names', () => {
    expect(colourToHex('notacolour')).toBeUndefined()
    expect(colourToHex('constructor')).toBeUndefined()
    expect(colourToHex('')).toBeUndefined()
  })
})
