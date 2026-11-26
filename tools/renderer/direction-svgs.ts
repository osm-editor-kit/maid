/**
 * Writes the direction marker SVGs (`packages/renderer/assets/direction/<shape>.svg`) from `direction-svg.ts`.
 * The files are generated, never edited by hand; a test fails when one differs from this output.
 *
 * Usage: bun run direction-svgs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIRECTION_SHAPES, directionSvg } from '../../packages/renderer/src/direction-svg'

const dir = join(import.meta.dir, '../../packages/renderer/assets/direction')
mkdirSync(dir, { recursive: true })
for (const shape of DIRECTION_SHAPES) {
  const file = join(dir, `${shape}.svg`)
  writeFileSync(file, directionSvg(shape))
  console.log(`wrote ${file}`)
}
