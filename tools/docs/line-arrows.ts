/**
 * Writes the sketches of docs/design/line-arrows.md (`docs/design/line-arrows/<case>.svg`): each case of the riding
 * direction drawn over a road in its states, with the renderer's own glyph geometry (packages/renderer/src/glyph.ts),
 * so the page cannot drift from the map. Light map only, no imagery. The files are generated; a test fails when one
 * differs from this output.
 *
 * Usage: bun run docs-line-arrows
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { lineArrowCases, lineArrowSvg } from './line-arrows-svg'

const dir = join(import.meta.dir, '../../docs/design/line-arrows')
mkdirSync(dir, { recursive: true })
for (const item of lineArrowCases) {
  const file = join(dir, `${item.id}.svg`)
  writeFileSync(file, lineArrowSvg(item))
  console.log(`wrote ${file}`)
}
