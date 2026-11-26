import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIRECTION_SHAPES, DIRECTION_VIEWBOX, directionParts, directionSvg } from './direction-svg'

const assets = join(import.meta.dir, '../assets/direction')

describe('direction SVG files', () => {
  for (const shape of DIRECTION_SHAPES) {
    const file = readFileSync(join(assets, `${shape}.svg`), 'utf8')

    test(`${shape}.svg is what the generator makes (run: bun run direction-svgs)`, () => {
      expect(file).toBe(directionSvg(shape))
    })

    test(`${shape}.svg is self-contained`, () => {
      expect(file).toContain(`viewBox="0 0 ${DIRECTION_VIEWBOX} ${DIRECTION_VIEWBOX}"`)
      expect(file).toContain('xmlns="http://www.w3.org/2000/svg"')
      expect(file).not.toContain('var(')
      expect(file).not.toContain('currentColor')
      expect(file).not.toMatch(/href|url\(|<style|<image/)
      expect(file.match(/<svg/g)).toHaveLength(1)
      expect(file.match(/<path /g)?.length).toBe(directionParts(shape).length)
    })
  }
})
