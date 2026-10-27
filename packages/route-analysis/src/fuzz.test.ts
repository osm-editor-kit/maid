import { describe, expect, it } from 'bun:test'
import { analyzeRoute } from './analyze.ts'
import { layoutOverview } from './layout/layout.ts'
import { generateRoute, type RouteKind } from './synthetic/generate.ts'
import { randomMutations } from './synthetic/mutate.ts'
import { seededRandom } from './synthetic/random.ts'
import type { RouteAnalysis } from './types.ts'

// Fuzz: generated routes with random mutations. Every mutation names the issues it must cause; the analysis and the
// layout must not throw, must give each member exactly one kind and must show every member somewhere.

function shownMembers(analysis: RouteAnalysis, mode: 'schematic' | 'scaled') {
  const layout = layoutOverview(analysis, mode)
  const shown = new Set<number>()
  for (const row of layout.rows) for (const index of row.members) shown.add(index)
  for (const section of layout.sections) for (const index of section.members) shown.add(index)
  const attached = layout.rows.flatMap((row) => row.issues)
  return { shown, attached, layout }
}

const KINDS: RouteKind[] = ['hiking', 'bicycle', 'bus']

describe('route analysis under random mutations', () => {
  for (const kind of KINDS) {
    it(`${kind}: 60 seeds, each with 1 to 4 mutations`, () => {
      const failures: string[] = []
      for (let seed = 1; seed <= 60; seed++) {
        const random = seededRandom(seed * 7919)
        const base = generateRoute({ seed, kind, ways: 40 + (seed % 7) * 15 })
        const { generated, expect: wanted, applied } = randomMutations(base, random, 1 + (seed % 4))
        const analysis = analyzeRoute(generated.input)
        expect(analysis.members.length).toBe(generated.input.members.length)
        const codes = new Set(analysis.issues.map((issue) => issue.code))
        // order and stop sequence are only judged on a line without gaps: with a gap (from another mutation, or a
        // duplicate that a shuffle moved apart) the gap must be reported instead
        const noLine = analysis.chain.linear === 'no'
        for (const code of wanted) {
          const needed = noLine && (code === 'order' || code === 'out-of-sequence') ? 'gap' : code
          if (!codes.has(needed))
            failures.push(`${kind} seed ${seed} [${applied.join(', ')}]: no ${needed}`)
        }
        for (const mode of ['schematic', 'scaled'] as const) {
          const { shown, attached, layout } = shownMembers(analysis, mode)
          for (let i = 0; i < generated.input.members.length; i++)
            if (!shown.has(i)) failures.push(`${kind} seed ${seed} ${mode}: member ${i} not shown`)
          expect(attached.length).toBe(analysis.issues.length)
          expect(Number.isFinite(layout.height)).toBe(true)
        }
      }
      expect(failures).toEqual([])
    })
  }

  it('an unmutated route has no warnings', () => {
    for (const kind of KINDS) {
      const { input } = generateRoute({ seed: 3, kind, ways: 120 })
      const analysis = analyzeRoute(input)
      expect(analysis.chain.linear).toBe('yes')
      expect(analysis.issues.filter((issue) => issue.severity === 'warning')).toEqual([])
    }
  })
})
