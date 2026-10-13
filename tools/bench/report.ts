/**
 * Renders benchmark runs as Markdown and a self-contained HTML page.
 *
 *   bun run bench-report [run-id ...]      (default: the latest run)
 *
 * Several run ids are merged into one report, e.g. a main run plus variant runs. For each Maid column the report also says
 * how Maid compares with the fastest of the other editors on each measurement.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { columnOf, ROWS, type Row } from './metrics'
import type { RunResult } from './run'
import { median } from './stats'

const ROOT = join(import.meta.dir, '../..')
const reportsDir = join(ROOT, 'reports')
let runIds = process.argv.slice(2)
if (runIds.length === 0) {
  const all = readdirSync(reportsDir)
    .filter((d) => /^\d{4}-/.test(d))
    .sort()
  runIds = [all[all.length - 1]!]
}
const runs = await Promise.all(
  runIds.map(async (id) => ({
    id,
    ...((await Bun.file(join(reportsDir, id, 'results.json')).json()) as {
      environment: any
      results: RunResult[]
    }),
  })),
)
const env = runs[0]!.environment
const results = runs.flatMap((run) => run.results.map((r) => ({ ...r, runId: run.id })))

const scenes = [...new Set(results.map((r) => r.scene))]
const columns = [...new Set(results.map(columnOf))]
const editorOf = new Map(results.map((r) => [columnOf(r), r.editor] as const))
const maidColumns = columns.filter((c) => editorOf.get(c) === 'maid')
const otherColumns = columns.filter((c) => editorOf.get(c) !== 'maid')
const fmt = (n: number | undefined) =>
  n === undefined || Number.isNaN(n)
    ? '–'
    : n >= 100
      ? String(Math.round(n))
      : String(Math.round(n * 10) / 10)

function cell(scene: string, column: string, row: Row) {
  const values = results
    .filter((r) => r.scene === scene && columnOf(r) === column && r.ok)
    .map(row.get)
    .filter((v): v is number => v != null && !Number.isNaN(v))
  if (values.length === 0) {
    // a phase that did not run says why: the report shows "not measured", not a dash
    const reason = results
      .filter((r) => r.scene === scene && columnOf(r) === column && row.phase)
      .map((r) => r.notMeasured?.[row.phase!])
      .find((v) => v !== undefined)
    if (reason !== undefined)
      return { text: 'not measured', value: undefined as number | undefined, reason }
    return { text: '–', value: undefined as number | undefined, reason: undefined }
  }
  const mid = median(values)
  const spread =
    values.length > 1
      ? ` <small>(${fmt(Math.min(...values))}–${fmt(Math.max(...values))})</small>`
      : ''
  return { text: `${fmt(mid)}${spread}`, value: mid, reason: undefined }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * How a Maid value stands against the fastest of the other editors: "1.8x faster than Rapid", "12 ms slower than iD".
 * Ratios for speed, the difference in ms for a time that is slower; fps is compared as a ratio.
 */
function versus(
  row: Row,
  maid: number | undefined,
  others: { name: string; value: number }[],
): string {
  if (maid === undefined || others.length === 0 || row.better === 'none') return '–'
  if (row.better === 'low') {
    const best = others.reduce((a, b) => (b.value < a.value ? b : a))
    if (maid <= best.value) {
      const ratio = best.value / Math.max(maid, 0.1)
      return ratio >= 1.05
        ? `${round1(ratio)}x faster than ${best.name}`
        : `as fast as ${best.name}`
    }
    if (row.unit === 'ms') return `${fmt(maid - best.value)} ms slower than ${best.name}`
    return `${round1(maid / Math.max(best.value, 0.1))}x slower than ${best.name}`
  }
  const best = others.reduce((a, b) => (b.value > a.value ? b : a))
  if (maid >= best.value) {
    const ratio = maid / Math.max(best.value, 0.1)
    return ratio >= 1.05 ? `${round1(ratio)}x the ${best.name} value` : `as high as ${best.name}`
  }
  return `${fmt(best.value - maid)} lower than ${best.name}`
}

let md = `# Benchmark ${runIds.join(' + ')}\n\n`
md += `- Date: ${env.date}\n- Machine: ${env.machine}, GPU: ${env.gpu}\n- Browser: ${String(env.browser).startsWith('Chrome') || /^[a-z]/.test(String(env.browser)) ? env.browser : `Chrome ${env.browser}`}, headless, viewport ${env.viewport.width}×${env.viewport.height} at ${env.deviceScaleFactor}x\n`
md += `- Repeats per cell: ${env.repeat}. Cells show the median, with the range in brackets.\n`
if (env.editReps !== undefined)
  md += `- Edit interactions: ${env.editReps} repetitions each, after one warm-up that is not counted.\n`
if (env.app && env.app !== 'maid')
  md += `- Maid app: ${env.app}${env.maidLens ? `, lens ${env.maidLens} on` : ''}\n`
else if (env.maidLens) md += `- Maid lens: ${env.maidLens}\n`
md += `- iD: ${env.pins?.id?.tag ?? '?'} (${String(env.pins?.id?.commit).slice(0, 9)}), Rapid: ${String(env.pins?.rapid?.commit).slice(0, 9)}, Maid: ${env.git}\n\n`

let html = `<!doctype html><meta charset="utf-8"><title>Maid benchmark ${runIds[0]}</title><style>
body{font:14px/1.5 system-ui,sans-serif;max-width:1500px;margin:2rem auto;padding:0 1rem;color:#222}
table{border-collapse:collapse;margin:1rem 0}td,th{border:1px solid #ccc;padding:4px 10px;text-align:right}
td:first-child,th:first-child{text-align:left}th{background:#f2f2f2}small{color:#777}
td.vs{text-align:left;color:#444;font-size:13px}td.na{color:#999;font-style:italic}
.best{background:#d9f2d9;font-weight:600}.worst{background:#fbe3e3}
.shots{display:grid;grid-template-columns:repeat(${Math.min(3, columns.length)},1fr);gap:8px}.shots img{width:100%;border:1px solid #999}
.shots figure{margin:0}figcaption{font-weight:600}
</style><h1>Maid benchmark</h1>${md
  .split('\n')
  .filter((l) => l.startsWith('- '))
  .map((l) => `<div>${l.slice(2)}</div>`)
  .join('')}`

for (const scene of scenes) {
  md += `## Scene: ${scene}\n\n`
  html += `<h2>Scene: ${scene}</h2>`
  // what each editor held and drew
  md += `| What was drawn | ${columns.join(' | ')} |\n|---|${columns.map(() => '---:').join('|')}|\n`
  html += `<table><tr><th>What was drawn</th>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>`
  const statsOf = (column: string) => {
    const r = results.find((x) => x.scene === scene && columnOf(x) === column && x.ok)
    return r?.stats as
      | {
          entities: Record<string, number>
          drawn: Record<string, number>
          hidden: Record<string, number>
        }
      | undefined
  }
  const statRows: [string, (s: NonNullable<ReturnType<typeof statsOf>>) => string][] = [
    [
      'Entities in memory (nodes / ways / relations)',
      (s) => `${s.entities.nodes} / ${s.entities.ways} / ${s.entities.relations}`,
    ],
    [
      "On screen (editor's own count)",
      (s) =>
        Object.entries(s.drawn)
          .map(([k, v]) => `${k} ${v}`)
          .join(', '),
    ],
    [
      'Hidden by the editor',
      (s) =>
        Object.entries(s.hidden)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ') || 'nothing',
    ],
  ]
  for (const [label, get] of statRows) {
    const cells = columns.map((c) => {
      const s = statsOf(c)
      return s ? get(s) : '–'
    })
    md += `| ${label} | ${cells.join(' | ')} |\n`
    html += `<tr><td>${label}</td>${cells.map((c) => `<td style="text-align:left;max-width:380px">${c}</td>`).join('')}</tr>`
  }
  md += '\n'
  html += '</table>'

  // the Maid columns, each with its position against the fastest other editor
  const vsHeader = (c: string) => `${c}: against the fastest other editor`
  md += `| Measurement | ${columns.join(' | ')} | ${maidColumns.map(vsHeader).join(' | ')} |\n|---|${columns.map(() => '---:').join('|')}|${maidColumns.map(() => '---').join('|')}|\n`
  html += `<table><tr><th>Measurement</th>${columns.map((c) => `<th>${c}</th>`).join('')}${maidColumns.map((c) => `<th>${vsHeader(c)}</th>`).join('')}</tr>`
  const notes = new Set<string>()
  for (const row of ROWS) {
    const cells = columns.map((c) => cell(scene, c, row))
    for (const c of cells) if (c.reason) notes.add(`${row.label}: ${c.reason}`)
    const values = cells.map((c) => c.value).filter((v): v is number => v !== undefined)
    const best = row.better === 'low' ? Math.min(...values) : Math.max(...values)
    const worst = row.better === 'low' ? Math.max(...values) : Math.min(...values)
    const unit = row.unit ? ` (${row.unit})` : ''
    const others = otherColumns
      .map((c) => ({ name: c, value: cell(scene, c, row).value }))
      .filter((o): o is { name: string; value: number } => o.value !== undefined)
    const vs = maidColumns.map((c) => versus(row, cell(scene, c, row).value, others))
    md += `| ${row.label}${unit} | ${cells.map((c) => (c.value === best && values.length > 1 ? `**${c.text}**` : c.text).replace(/<\/?small>/g, '')).join(' | ')} | ${vs.join(' | ')} |\n`
    html += `<tr><td>${row.label}${unit}</td>${cells
      .map(
        (c) =>
          `<td class="${c.reason ? 'na' : values.length > 1 && c.value === best ? 'best' : values.length > 2 && c.value === worst ? 'worst' : ''}"${c.reason ? ` title="${c.reason.replace(/"/g, '&quot;')}"` : ''}>${c.text}</td>`,
      )
      .join('')}${vs.map((v) => `<td class="vs">${v}</td>`).join('')}</tr>`
  }
  md += '\n'
  html += '</table>'
  if (notes.size) {
    md += `Not measured:\n\n${[...notes].map((n) => `- ${n}`).join('\n')}\n\n`
    html += `<p><b>Not measured:</b></p><ul>${[...notes].map((n) => `<li>${n}</li>`).join('')}</ul>`
  }

  const failures = results.filter((r) => r.scene === scene && !r.ok)
  if (failures.length) {
    md += `Failed runs: ${failures.map((f) => `${columnOf(f)} #${f.repeat}: ${f.error}`).join('; ')}\n\n`
    html += `<p><b>Failed runs:</b> ${failures.map((f) => `${columnOf(f)} #${f.repeat}: ${f.error}`).join('; ')}</p>`
  }
  for (const shot of ['load', 'zoom', 'select', 'drag']) {
    html += `<h3>${scene}: ${shot === 'load' ? 'after loading' : shot === 'zoom' ? 'zoomed in two levels' : shot === 'drag' ? 'after dragging a road junction' : 'a selected way'}</h3><div class="shots">`
    for (const c of columns) {
      const r = results.find((x) => x.scene === scene && columnOf(x) === c && x.screenshots[shot])
      if (r)
        html += `<figure><figcaption>${c}</figcaption><a href="../${r.runId}/${r.screenshots[shot]}"><img loading="lazy" src="../${r.runId}/${r.screenshots[shot]}"></a></figure>`
    }
    html += '</div>'
  }
}

const blocked: Record<string, Record<string, number>> = {}
for (const r of results) {
  for (const [host, n] of Object.entries(r.blocked)) {
    blocked[columnOf(r)] ??= {}
    blocked[columnOf(r)]![host] = Math.max(blocked[columnOf(r)]![host] ?? 0, n)
  }
}
md += `## Requests that were blocked\n\nEvery request to a host other than localhost is blocked and counted. None may go to OSM infrastructure.\n\n`
html +=
  '<h2>Requests that were blocked</h2><p>Every request to a host other than localhost is blocked and counted. None may go to OSM infrastructure.</p><ul>'
for (const c of columns) {
  const list =
    Object.entries(blocked[c] ?? {})
      .map(([h, n]) => `${h} (${n})`)
      .join(', ') || 'none'
  md += `- ${c}: ${list}\n`
  html += `<li><b>${c}:</b> ${list}</li>`
}
html += '</ul>'

const out = join(reportsDir, runIds[0]!)
await Bun.write(join(out, 'report.md'), md)
await Bun.write(join(out, 'report.html'), html)
console.log(`report: ${join(out, 'report.md')}\nreport: ${join(out, 'report.html')}`)
