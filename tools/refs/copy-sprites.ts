/**
 * Copies iD's full icon sprites from the pinned iD build into .reference/sprites-full (git-ignored), then cuts the
 * subset that Maid ships into packages/shell/public/sprites (subset-sprites.ts). Run after refs setup.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { FULL_DIR, SPRITE_SETS, SUBSET_DIR, subsetSprites } from './subset-sprites.ts'

const from = join(import.meta.dir, '../../.reference/id/dist/img')
if (!existsSync(from)) throw new Error(`${from} is missing. Run: bun tools/refs/id/setup.ts`)
mkdirSync(FULL_DIR, { recursive: true })
for (const set of SPRITE_SETS)
  cpSync(join(from, `${set}-sprite.svg`), join(FULL_DIR, `${set}-sprite.svg`))
console.log(`Copied iD's full icon sprites to ${FULL_DIR}`)

const report = await subsetSprites()
console.log(`Wrote the subset sprites to ${SUBSET_DIR}`)
if (report.missing.length > 0) {
  throw new Error(`Used icons missing from iD's sprites: ${report.missing.join(', ')}`)
}

cpSync(join(import.meta.dir, 'frame-sync.js'), join(SUBSET_DIR, '../frame-sync.js'))
