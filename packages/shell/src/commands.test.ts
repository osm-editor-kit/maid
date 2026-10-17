import { describe, expect, it } from 'bun:test'
import { editMenuItems } from './commands'

// The edit menu's items at a place: Paste only on open ground, never on a feature (Cmd+V is not the menu).
describe('editMenuItems', () => {
  const parts = {
    here: ['Here: 2 features'],
    selection: ['continue', 'move', 'rotate', 'copy', 'reverse', 'delete'],
    paste: ['paste'],
  }

  it('shows only Paste on open ground', () => {
    expect(editMenuItems({ ground: true }, parts)).toEqual(['paste'])
  })

  it('shows no Paste on a feature, and the selection with its features first', () => {
    expect(editMenuItems({}, parts)).toEqual([
      'Here: 2 features',
      'continue',
      'move',
      'rotate',
      'copy',
      'reverse',
      'delete',
    ])
  })

  it('shows no Paste on a feature whose menu has no features listed', () => {
    expect(editMenuItems({ ground: false }, { ...parts, here: [] })).not.toContain('paste')
  })

  it('shows nothing for open ground when nothing can be pasted', () => {
    expect(editMenuItems({ ground: true }, { here: [], selection: [], paste: [] })).toEqual([])
  })
})
