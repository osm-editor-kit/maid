/**
 * Renders benchmark runs as Markdown and a self-contained HTML page.
 *
 *   bun run bench-report [run-id ...]      (default: the latest run)
 *
 * Several run ids are merged into one report, e.g. a main run plus variant runs.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { RunResult } from './run'
import { median } from './stats'

const ROOT = join(import.meta.dir, '../..')
const reportsDir = join(ROOT, 'reports')
let runIds = process.argv.slice(2)
if (runIds.length === 0) {
  const all = readdirSync(reportsDir).filter((d) => /^\d{4}-/.test(d)).sort()
  runIds = [all[all.length - 1]!]
}
const runs = await Promise.all(
  runIds.map(async (id) => ({ id, ...((await Bun.file(join(reportsDir, id, 'results.json')).json()) as { environment: any; results: RunResult[] }) })),
)
const env = runs[0]!.environment
const results = runs.flatMap((run) => run.results.map((r) => ({ ...r, runId: run.id })))

type Row = { label: string; unit: string; better: 'low' | 'high' | 'none'; get: (r: RunResult) => number | undefined; note?: string }
const ROWS: Row[] = [
  { label: 'Load: until the picture is complete', unit: 'ms', better: 'low', get: (r) => r.load?.settledMs },
  { label: 'Load: main-thread work', unit: 'ms', better: 'low', get: (r) => r.load?.cpuMs },
  { label: 'Pan into new data: frame time p95', unit: 'ms', better: 'low', get: (r) => r.panCold?.p95Ms },
  { label: 'Pan into new data: worst frame', unit: 'ms', better: 'low', get: (r) => r.panCold?.maxMs },
  { label: 'Pan into new data: until correct afterwards', unit: 'ms', better: 'low', get: (r) => r.panCold?.settleMs },
  { label: 'Pan over loaded data: frame time p95', unit: 'ms', better: 'low', get: (r) => r.panWarm?.p95Ms },
  { label: 'Pan over loaded data: worst frame', unit: 'ms', better: 'low', get: (r) => r.panWarm?.maxMs },
  { label: 'Pan over loaded data: frames per second', unit: '', better: 'high', get: (r) => r.panWarm?.fps },
  { label: 'Pan over loaded data: main-thread work per second', unit: 'ms', better: 'low', get: (r) => (r.panWarm ? Math.round(r.panWarm.cpuMs / (r.panWarm.frames / Math.max(1, r.panWarm.fps))) : undefined) },
  { label: 'Pan over loaded data: until correct afterwards', unit: 'ms', better: 'low', get: (r) => r.panWarm?.settleMs },
  { label: 'Zoom in: frame time p95', unit: 'ms', better: 'low', get: (r) => r.zoomIn?.p95Ms },
  { label: 'Zoom in: worst frame', unit: 'ms', better: 'low', get: (r) => r.zoomIn?.maxMs },
  { label: 'Zoom in: until correct afterwards', unit: 'ms', better: 'low', get: (r) => r.zoomIn?.settleMs },
  { label: 'Zoom out: frame time p95', unit: 'ms', better: 'low', get: (r) => r.zoomOut?.p95Ms },
  { label: 'Zoom out: until correct afterwards', unit: 'ms', better: 'low', get: (r) => r.zoomOut?.settleMs },
  { label: 'Hover: pointer move to highlight', unit: 'ms', better: 'low', get: (r) => medianOf(r.hoverLatencyMs?.filter((v) => v >= 0)) },
  { label: 'Hover sweep: frame time p95', unit: 'ms', better: 'low', get: (r) => r.hoverSweep?.p95Ms },
  { label: 'Hover sweep: main-thread work per second', unit: 'ms', better: 'low', get: (r) => (r.hoverSweep ? Math.round(r.hoverSweep.cpuMs / 2.4) : undefined) },
  { label: 'Select a way: until drawn', unit: 'ms', better: 'low', get: (r) => medianOf(r.selectMs) },
  { label: 'JS heap after the run', unit: 'MB', better: 'low', get: (r) => r.heapMb },
]

function medianOf(values: number[] | undefined) {
  return values && values.length ? median(values) : undefined
}

const scenes = [...new Set(results.map((r) => r.scene))]
const columns = [...new Set(results.map((r) => `${r.editor}${r.variant === 'default' ? '' : ` (${r.variant})`}`))]
const columnOf = (r: RunResult) => `${r.editor}${r.variant === 'default' ? '' : ` (${r.variant})`}`
const fmt = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '–' : n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10))

function cell(scene: string, column: string, row: Row) {
  const values = results
    .filter((r) => r.scene === scene && columnOf(r) === column && r.ok)
    .map(row.get)
    .filter((v): v is number => v !== undefined && !Number.isNaN(v))
  if (values.length === 0) return { text: '–', value: undefined as number | undefined }
  const mid = median(values)
  const spread = values.length > 1 ? ` <small>(${fmt(Math.min(...values))}–${fmt(Math.max(...values))})</small>` : ''
  return { text: `${fmt(mid)}${spread}`, value: mid }
}

function statsOf(scene: string, column: string) {
  const r = results.find((x) => x.scene === scene && columnOf(x) === column && x.ok)
  return r?.stats as { entities: Record<string, number>; drawn: Record<string, number>; hidden: Record<string, number> } | undefined
}

let md = `# Benchmark ${runIds.join(' + ')}\n\n`
md += `- Date: ${env.date}\n- Machine: ${env.machine}, GPU: ${env.gpu}\n- Browser: Chrome ${env.browser}, headless, viewport ${env.viewport.width}×${env.viewport.height} at ${env.deviceScaleFactor}x\n`
md += `- Repeats per cell: ${env.repeat}. Cells show the median, with the range in brackets.\n`
md += `- iD: ${env.pins?.id?.tag ?? '?'} (${String(env.pins?.id?.commit).slice(0, 9)}), Rapid: ${String(env.pins?.rapid?.commit).slice(0, 9)}, Maid: ${env.git}\n\n`

let html = `<!doctype html><meta charset="utf-8"><title>Maid benchmark ${runIds[0]}</title><style>
body{font:14px/1.5 system-ui,sans-serif;max-width:1500px;margin:2rem auto;padding:0 1rem;color:#222}
table{border-collapse:collapse;margin:1rem 0}td,th{border:1px solid #ccc;padding:4px 10px;text-align:right}
td:first-child,th:first-child{text-align:left}th{background:#f2f2f2}small{color:#777}
.best{background:#d9f2d9;font-weight:600}.worst{background:#fbe3e3}
.shots{display:grid;grid-template-columns:repeat(${Math.min(3, columns.length)},1fr);gap:8px}.shots img{width:100%;border:1px solid #999}
.shots figure{margin:0}figcaption{font-weight:600}
</style><h1>Maid benchmark</h1>${md.split('\n').filter((l) => l.startsWith('- ')).map((l) => `<div>${l.slice(2)}</div>`).join('')}`

for (const scene of scenes) {
  md += `## Scene: ${scene}\n\n`
  html += `<h2>Scene: ${scene}</h2>`
  // what each editor held and drew
  md += `| What was drawn | ${columns.join(' | ')} |\n|---|${columns.map(() => '---:').join('|')}|\n`
  html += `<table><tr><th>What was drawn</th>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>`
  const statRows: [string, (s: NonNullable<ReturnType<typeof statsOf>>) => string][] = [
    ['Entities in memory (nodes / ways / relations)', (s) => `${s.entities.nodes} / ${s.entities.ways} / ${s.entities.relations}`],
    ['On screen (editor\'s own count)', (s) => Object.entries(s.drawn).map(([k, v]) => `${k} ${v}`).join(', ')],
    ['Hidden by the editor', (s) => Object.entries(s.hidden).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing'],
  ]
  for (const [label, get] of statRows) {
    const cells = columns.map((c) => {
      const s = statsOf(scene, c)
      return s ? get(s) : '–'
    })
    md += `| ${label} | ${cells.join(' | ')} |\n`
    html += `<tr><td>${label}</td>${cells.map((c) => `<td style="text-align:left;max-width:380px">${c}</td>`).join('')}</tr>`
  }
  md += '\n'
  html += '</table>'

  md += `| Measurement | ${columns.join(' | ')} |\n|---|${columns.map(() => '---:').join('|')}|\n`
  html += `<table><tr><th>Measurement</th>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>`
  for (const row of ROWS) {
    const cells = columns.map((c) => cell(scene, c, row))
    const values = cells.map((c) => c.value).filter((v): v is number => v !== undefined)
    const best = row.better === 'low' ? Math.min(...values) : Math.max(...values)
    const worst = row.better === 'low' ? Math.max(...values) : Math.min(...values)
    const unit = row.unit ? ` (${row.unit})` : ''
    md += `| ${row.label}${unit} | ${cells.map((c) => (c.value === best && values.length > 1 ? `**${c.text}**` : c.text).replace(/<\/?small>/g, '')).join(' | ')} |\n`
    html += `<tr><td>${row.label}${unit}</td>${cells
      .map((c) => `<td class="${values.length > 1 && c.value === best ? 'best' : values.length > 2 && c.value === worst ? 'worst' : ''}">${c.text}</td>`)
      .join('')}</tr>`
  }
  md += '\n'
  html += '</table>'

  const failures = results.filter((r) => r.scene === scene && !r.ok)
  if (failures.length) {
    md += `Failed runs: ${failures.map((f) => `${columnOf(f)} #${f.repeat}: ${f.error}`).join('; ')}\n\n`
    html += `<p><b>Failed runs:</b> ${failures.map((f) => `${columnOf(f)} #${f.repeat}: ${f.error}`).join('; ')}</p>`
  }
  for (const shot of ['load', 'zoom', 'select']) {
    html += `<h3>${scene}: ${shot === 'load' ? 'after loading' : shot === 'zoom' ? 'zoomed in two levels' : 'a selected way'}</h3><div class="shots">`
    for (const c of columns) {
      const r = results.find((x) => x.scene === scene && columnOf(x) === c && x.screenshots[shot])
      if (r) html += `<figure><figcaption>${c}</figcaption><a href="../${r.runId}/${r.screenshots[shot]}"><img loading="lazy" src="../${r.runId}/${r.screenshots[shot]}"></a></figure>`
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
html += '<h2>Requests that were blocked</h2><p>Every request to a host other than localhost is blocked and counted. None may go to OSM infrastructure.</p><ul>'
for (const c of columns) {
  const list = Object.entries(blocked[c] ?? {}).map(([h, n]) => `${h} (${n})`).join(', ') || 'none'
  md += `- ${c}: ${list}\n`
  html += `<li><b>${c}:</b> ${list}</li>`
}
html += '</ul>'

const out = join(reportsDir, runIds[0]!)
await Bun.write(join(out, 'report.md'), md)
await Bun.write(join(out, 'report.html'), html)
console.log(`report: ${join(out, 'report.md')}\nreport: ${join(out, 'report.html')}`)
