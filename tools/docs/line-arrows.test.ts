import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lineArrowCases, lineArrowSvg } from './line-arrows-svg'

const dir = join(import.meta.dir, '../../docs/design/line-arrows')

describe('the sketches of docs/design/line-arrows.md', () => {
  for (const item of lineArrowCases) {
    test(`${item.id}.svg is what the generator makes (run: bun run docs-line-arrows)`, () => {
      expect(readFileSync(join(dir, `${item.id}.svg`), 'utf8')).toBe(lineArrowSvg(item))
    })

    test(`${item.id}.svg has no attribute twice in an element (the browser would not draw it)`, () => {
      for (const element of lineArrowSvg(item).match(/<[a-z]+ [^>]*>/g) ?? []) {
        const names = [...element.matchAll(/ ([a-z-]+)=/g)].map((match) => match[1])
        expect(new Set(names).size).toBe(names.length)
      }
    })
  }
})
