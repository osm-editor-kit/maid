/**
 * Writes the size of the stored progress for several list sizes and status patterns to
 * `reports/osm-prefs-size.json` at the repository root, and prints the path.
 * Run: `bun packages/osm-prefs/scripts/size-report.ts`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { measure, STATUS_PATTERNS, type Measurement } from '../src/measure.ts'

const COUNTS = [0, 1, 4, 5, 100, 500, 2000, 5000, 20_000]

const rows: Measurement[] = []
for (const count of COUNTS) {
  for (const pattern of STATUS_PATTERNS) rows.push(await measure(count, pattern))
}

const outDir = join(import.meta.dir, '..', '..', '..', 'reports')
const outFile = join(outDir, 'osm-prefs-size.json')
await mkdir(outDir, { recursive: true })
await writeFile(outFile, `${JSON.stringify({ runtime: `bun ${Bun.version}`, rows }, null, 2)}\n`)

for (const row of rows) {
  process.stdout.write(
    `${String(row.count).padStart(6)} ${row.pattern.padEnd(17)} ${row.encoding} chunks ${String(row.chunks).padStart(3)} total ${String(row.totalChars).padStart(6)} chars\n`,
  )
}
process.stdout.write(`${outFile}\n`)
