import { describe, expect, it } from 'bun:test'
import { trafficSignData } from '@osm-traffic-signs/converter/data/DE'
import { formatSignValue, parseSignValue } from './sign-value.ts'
import { entriesForTypedText } from './SignSearch.tsx'

const typed = (text: string, existing = '') =>
  entriesForTypedText(text, 'DE', trafficSignData, parseSignValue(existing, 'DE', trafficSignData))

describe('Enter with typed text', () => {
  it('a code the catalogue knows is added as that sign', () => {
    expect(formatSignValue(typed('274-30'), 'DE')).toBe('DE:274-30')
  })
  it('a name is added as its best match', () => {
    const [entry] = typed('Fahrradstraße')
    expect(entry?.sign).toBeDefined()
  })
  it('text that matches nothing is added as an unknown row, as typed', () => {
    const [entry] = typed('qwertzuiop')
    expect(entry?.sign).toBeUndefined()
    expect(entry?.part).toBe('qwertzuiop')
  })
  it('empty text adds nothing', () => {
    expect(typed('   ')).toEqual([])
  })
})
