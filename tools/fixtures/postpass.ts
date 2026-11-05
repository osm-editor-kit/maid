/**
 * Cuts route previews from Postpass (postpass.geofabrik.de) into fixtures/postpass/route-<id>.json, for the mock's
 * `/postpass/api/interpreter` (tools/mock-osm-api/server.ts). A person runs it, or the orchestrator with a person's
 * OK for named relations (AGENTS.md, core rule 1): one request at a time, a pause between them, never under
 * automation. The answers are committed and reviewed like every fixture.
 *
 *   bun run fixtures-postpass r123 r456      the previews of these relations
 *   bun run fixtures-postpass --find "Rheinsteig" "Elberadweg"
 *                                            route relations with these exact names: id, route, network, length
 *
 * Writes the files and prints where; `--find` writes reports/postpass-find.json.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseRoutePreview,
  relationNumber,
  routePreviewSql,
} from '../../packages/route-analysis/src/index.ts'

const POSTPASS = 'https://postpass.geofabrik.de/api/interpreter'
const PAUSE_MS = 5_000
const ROOT = join(import.meta.dir, '../..')

if (process.env.CI || process.env.MAID_AUTOMATED) {
  console.error('fixtures-postpass is for a person only (AGENTS.md, core rule 1)')
  process.exit(1)
}

async function ask(sql: string) {
  const url = new URL(POSTPASS)
  url.searchParams.set('data', sql)
  url.searchParams.set('options[geojson]', 'false')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'maid-fixtures (https://github.com/osm-editor-kit/maid)' },
    signal: AbortSignal.timeout(300_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Postpass answered ${response.status}: ${text.slice(0, 300)}`)
  return text
}

/** Exact names only, so the query uses the name index of postpass_line (route relations are lines there) */
function findSql(names: string[]) {
  const list = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(', ')
  return `SELECT osm_id AS id, tags->>'name' AS name, tags->>'route' AS route, tags->>'network' AS network,
  round(length_m / 1000) AS km
FROM postpass_line
WHERE osm_type = 'R' AND tags->>'name' IN (${list})
ORDER BY length_m DESC
LIMIT 100`
}

const args = process.argv.slice(2)
const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))

if (args[0] === '--find') {
  const names = args.slice(1)
  if (names.length === 0) throw new Error('--find needs at least one name')
  const answer = JSON.parse(await ask(findSql(names)))
  await mkdir(join(ROOT, 'reports'), { recursive: true })
  const out = join(ROOT, 'reports/postpass-find.json')
  await writeFile(out, `${JSON.stringify(answer.result, null, 2)}\n`)
  console.table(answer.result)
  console.log(`wrote ${out}`)
} else {
  if (args.length === 0) throw new Error('Name the relations: bun run fixtures-postpass r123')
  await mkdir(join(ROOT, 'fixtures/postpass'), { recursive: true })
  for (const [index, id] of args.entries()) {
    if (index > 0) await pause()
    const number = relationNumber(id)
    const text = await ask(routePreviewSql(id))
    const preview = parseRoutePreview(id, text)
    const out = join(ROOT, `fixtures/postpass/route-${number}.json`)
    // one row per line: a reviewer reads the diff of a regenerated fixture
    const answer = JSON.parse(text)
    const rows = answer.result.map((row: unknown) => JSON.stringify(row)).join(',\n')
    await writeFile(
      out,
      `{"postpass_properties":${JSON.stringify(answer.postpass_properties)},"result":[\n${rows}\n]}\n`,
    )
    console.log(
      `wrote ${out}: ${preview.relations.size} relations, ${preview.ways.size} ways, ${preview.nodes.size} nodes, ${(text.length / 1e6).toFixed(1)} MB`,
    )
  }
}
