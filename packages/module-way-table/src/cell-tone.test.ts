import { describe, expect, it } from 'bun:test'
import type { CellState } from './cell-state.ts'
import { LEGEND_STATES, toneOf } from './cell-tone.ts'

const STATES: readonly CellState[] = ['reference', 'same', 'different', 'added', 'missing', 'empty']

describe('toneOf', () => {
  it('gives every state a fill or a mark, so the colour is never the only cue', () => {
    expect(toneOf('different').mark).toBe('≠')
    expect(toneOf('added').mark).toBe('+')
    expect(toneOf('missing').mark).toBe('−')
    expect(toneOf('missing').dashed).toBe(true)
    expect(toneOf('empty').cell).toBe('')
    expect(toneOf('same').cell).toBe('')
  })

  it('fills the reference blue and the differences amber, emerald and red', () => {
    expect(toneOf('reference').cell).toContain('bg-blue-50')
    expect(toneOf('different').cell).toContain('bg-amber-100')
    expect(toneOf('added').cell).toContain('bg-emerald-100')
    expect(toneOf('missing').cell).toContain('bg-red-50')
  })

  it('has a dark mode class for every fill and text colour', () => {
    for (const state of STATES) {
      const tone = toneOf(state)
      for (const classes of [tone.cell, tone.text]) {
        for (const part of classes.split(' ').filter(Boolean)) {
          if (part.startsWith('bg-') || part.startsWith('text-')) {
            if (state === 'same' || state === 'empty') continue
            if (state === 'reference' && part === 'text-zinc-950') continue
            expect(classes.includes('dark:')).toBe(true)
          }
        }
      }
    }
  })

  it('lists the legend states in the design order', () => {
    expect(LEGEND_STATES).toEqual(['reference', 'different', 'added', 'missing', 'empty'])
  })
})
