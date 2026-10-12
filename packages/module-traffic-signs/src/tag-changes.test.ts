import { describe, expect, it } from 'bun:test'
import { applySignTagChanges } from './tag-changes.ts'

function record(changes: Record<string, string | undefined>) {
  const calls: Array<[string, string | undefined]> = []
  applySignTagChanges(changes, (key, value) => calls.push([key, value]))
  return calls
}

describe('applySignTagChanges', () => {
  it('sets one tag per key, in order', () => {
    expect(record({ 'traffic_sign:forward': 'DE:274', traffic_sign: 'DE:237' })).toEqual([
      ['traffic_sign:forward', 'DE:274'],
      ['traffic_sign', 'DE:237'],
    ])
  })

  it('removes a tag for undefined and for an empty value', () => {
    expect(record({ 'traffic_sign:backward': undefined, traffic_sign: '' })).toEqual([
      ['traffic_sign:backward', undefined],
      ['traffic_sign', undefined],
    ])
  })

  it('calls nothing for no changes', () => {
    expect(record({})).toEqual([])
  })
})
