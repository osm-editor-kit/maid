import { afterEach, describe, expect, it } from 'bun:test'
import { cutActions, cutSnapshot } from './cut-store.ts'
import type { Loc } from './cut.ts'

const A: Loc = [13.4, 52.5]
const B: Loc = [13.401, 52.5]

afterEach(() => {
  cutActions().end()
})

describe('cut store', () => {
  it('starts with nothing: no way, no line, no pieces, no refusal', () => {
    expect(cutSnapshot()).toMatchObject({
      wayId: undefined,
      points: undefined,
      pieces: undefined,
      refusal: undefined,
    })
  })

  it('begins a cut of a way with no line yet', () => {
    cutActions().show([A, B], undefined, 'crossings')
    cutActions().begin('w7')
    expect(cutSnapshot()).toMatchObject({
      wayId: 'w7',
      points: undefined,
      pieces: undefined,
      refusal: undefined,
    })
  })

  it('shows the line with its pieces, or with the reason it is refused', () => {
    cutActions().begin('w1')
    const ring = [A, B, A]
    cutActions().show([A, B], [ring, ring], undefined)
    expect(cutSnapshot()).toMatchObject({
      points: [A, B],
      pieces: [ring, ring],
      refusal: undefined,
    })
    cutActions().show([A, B], undefined, 'crossings')
    expect(cutSnapshot()).toMatchObject({ points: [A, B], pieces: undefined, refusal: 'crossings' })
  })

  it('clears everything when the cut ends', () => {
    cutActions().begin('w1')
    cutActions().show([A, B], undefined, 'tangent')
    cutActions().end()
    expect(cutSnapshot()).toMatchObject({
      wayId: undefined,
      points: undefined,
      pieces: undefined,
      refusal: undefined,
    })
  })
})
