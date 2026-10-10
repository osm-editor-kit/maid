/** Copies iD's icon sprites from the pinned iD build into the Maid app. Run after refs setup. */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const from = join(import.meta.dir, '../../.reference/id/dist/img')
const to = join(import.meta.dir, '../../apps/maid/public/sprites')
if (!existsSync(from)) throw new Error(`${from} is missing. Run: bun tools/refs/id/setup.ts`)
mkdirSync(to, { recursive: true })
for (const set of ['maki', 'temaki', 'fa', 'roentgen', 'iD']) cpSync(join(from, `${set}-sprite.svg`), join(to, `${set}-sprite.svg`))
console.log(`Copied icon sprites to ${to}`)
