/**
 * The overview page at the site's root when several apps are deployed: what Maid is, a tile per editor, its strengths,
 * the comparison with iD and Rapid, and thanks. One self-contained HTML file: inline CSS, the logos inlined, no script
 * from elsewhere. The data is in `features.ts` and in each app's `overview.json`.
 */
import {
  GROUPS,
  HIGHLIGHT_NUMBERS,
  PERFORMANCE_SOURCE,
  STRENGTHS,
  THANKS,
  THANKS_TOP,
} from './features.ts'
import type { FeatureRow, ListedApp, Support } from './types.ts'

const ID_REPO = 'https://github.com/openstreetmap/iD'
const RAPID_REPO = 'https://github.com/bhousel/Rapid'

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Which apps have a row's feature: every app for `core`, otherwise the apps whose config calls its factory */
export function supportOf(row: FeatureRow, app: ListedApp): Support {
  if (row.maid === 'core') return row.maidSupport ?? 'yes'
  const factories = 'factory' in row.maid ? [row.maid.factory] : row.maid.factories
  return factories.some((factory) => app.factories.has(factory)) ? (row.maidSupport ?? 'yes') : 'no'
}

/** The module factories an app config calls, one per line of its `modules` list: `levels(` and `levels({…})` alike */
export function factoriesOf(configSource: string) {
  const found = new Set<string>()
  const modules = /modules[^=]*=\s*\[([\s\S]*?)\n\s*\]/.exec(configSource)?.[1] ?? ''
  for (const match of modules.matchAll(/^\s*([a-zA-Z]\w*)\(/gm)) found.add(match[1]!)
  // a module made before the list (`const background = imagery()`) and named in it (`background,`)
  const made = new Map(
    [...configSource.matchAll(/^const (\w+) = ([a-zA-Z]\w*)\(/gm)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  )
  for (const match of modules.matchAll(/^\s*([a-zA-Z]\w*),?\s*$/gm)) {
    const factory = made.get(match[1]!)
    if (factory) found.add(factory)
  }
  return found
}

const LABEL: Record<Support, string> = { yes: 'Yes', partial: 'Partly', no: 'No' }

function cell(support: Support) {
  return `<td class="cell ${support}"><span class="mark" aria-hidden="true"></span><span class="sr">${LABEL[support]}</span></td>`
}

function docsLink(row: FeatureRow, repository: string) {
  if (!row.pkg) return ''
  return ` <a class="docs" href="https://github.com/${repository}/tree/main/packages/${row.pkg}#readme">docs</a>`
}

function comparison(apps: ListedApp[], repository: string) {
  const heads = apps
    .map(
      (app) =>
        `<th scope="col" class="app"><a href="${app.folder}/?${escapeHtml(app.overview.open)}">${escapeHtml(app.name.replace(/^Maid /, ''))}</a></th>`,
    )
    .join('')
  const columns = 2 + apps.length + 1
  const body = GROUPS.map((group) => {
    const rows = group.rows
      .map((row) => {
        const cells = [
          cell(row.iD),
          cell(row.rapid),
          ...apps.map((app) => cell(supportOf(row, app))),
        ]
        const note = row.note ? `<span class="note">${escapeHtml(row.note)}</span>` : ''
        return `<tr><th scope="row"><span class="feature">${escapeHtml(row.title)}</span>${docsLink(row, repository)}<span class="text">${escapeHtml(row.text)}</span>${note}</th>${cells.join('')}</tr>`
      })
      .join('\n')
    const intro = group.intro ? `<span class="intro">${escapeHtml(group.intro)}</span>` : ''
    return `<tbody><tr class="group" id="${group.id}"><th colspan="${columns}" scope="rowgroup">${escapeHtml(group.title)}${intro}</th></tr>\n${rows}</tbody>`
  }).join('\n')
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Feature comparison">
<table class="compare">
<thead><tr><th scope="col" class="corner">Feature</th><th scope="col" class="ref"><a href="${ID_REPO}">iD</a></th><th scope="col" class="ref"><a href="${RAPID_REPO}">Rapid</a></th>${heads}</tr></thead>
${body}
</table>
</div>`
}

function tile(app: ListedApp, repository: string) {
  const { overview } = app
  const highlights = overview.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
  const shot = app.shot
    ? `<a class="shot" href="${app.folder}/?${escapeHtml(overview.open)}"><img src="${app.shot}" alt="${escapeHtml(app.name)} with its topic on the map (fixture data)" width="960" height="600" loading="lazy" /></a>`
    : ''
  return `<article class="tile">
  ${shot}
  <div class="tile-head">
    <span class="logo">${app.logo}</span>
    <div><h3>${escapeHtml(app.name)}</h3><p class="detail">${escapeHtml(overview.tagline)}</p></div>
  </div>
  <p class="description">${escapeHtml(overview.description)}</p>
  <ul class="highlights">${highlights}</ul>
  <div class="actions">
    <a class="button primary" href="${app.folder}/?${escapeHtml(overview.open)}">Open ${escapeHtml(app.name)}</a>
    <a class="button" href="https://github.com/${repository}/blob/main/apps/${app.folder}/src/maid.config.ts">Its config</a>
  </div>
</article>`
}

function strengths() {
  return STRENGTHS.map(
    (item) =>
      `<div class="strength"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div>`,
  ).join('\n')
}

function numbers() {
  return HIGHLIGHT_NUMBERS.map(
    (item) =>
      `<div class="number"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`,
  ).join('\n')
}

function thanks() {
  const top = THANKS_TOP.map(
    (item) =>
      `<li class="thanks-top"><a href="${item.url}">${escapeHtml(item.name)}</a><span>${escapeHtml(item.text)}</span></li>`,
  ).join('\n')
  const rest = THANKS.map(
    (item) =>
      `<li><a href="${item.url}">${escapeHtml(item.name)}</a><span>${escapeHtml(item.text)}</span></li>`,
  ).join('\n')
  return `<ul class="thanks">${top}\n${rest}</ul>`
}

/** The page at the path when several apps are deployed */
export function indexPage(apps: ListedApp[], repository: string) {
  const [first] = apps
  const openFirst = first ? `${first.folder}/?${escapeHtml(first.overview.open)}` : '#editors'
  const brand = first?.logo ?? ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Maid editors</title>
<meta name="description" content="Maid, the MapLibre iD Editor: OpenStreetMap editors for one topic each, built on iD's knowledge and a fast WebGL map." />
<style>
${CSS}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="#top">${brand}<span>Maid</span></a>
  <nav aria-label="Sections">
    <a href="#editors">Editors</a>
    <a href="#why">Why Maid</a>
    <a href="#compare">Compare</a>
    <a href="#thanks">Thanks</a>
    <a href="https://github.com/${repository}">GitHub</a>
  </nav>
</header>
<main id="top">
<section class="hero">
  <p class="eyebrow">MapLibre iD Editor</p>
  <h1>An OpenStreetMap editor for every topic.</h1>
  <p class="lead">Maid keeps what makes <a href="${ID_REPO}">iD</a> good (the tagging schema, the presets, the way mappers edit) and puts it on a fast WebGL map. One core, many editors: each community gets an editor made for its topic, from a config file and a few modules.</p>
  <div class="actions">
    <a class="button primary" href="${openFirst}">Open Maid</a>
    <a class="button" href="#editors">See all editors</a>
    <a class="button" href="https://github.com/${repository}">Fork on GitHub</a>
  </div>
  <div class="numbers">
${numbers()}
  </div>
  <p class="source">${PERFORMANCE_SOURCE}</p>
</section>

<section id="editors">
  <h2>The editors</h2>
  <p class="section-lead">Every editor is the same Maid with other modules switched on. All of them edit OpenStreetMap directly: log in, map, save.</p>
  <div class="tiles">
${apps.map((app) => tile(app, repository)).join('\n')}
  </div>
</section>

<section id="why">
  <h2>Why Maid</h2>
  <div class="strengths">
${strengths()}
  </div>
</section>

<section id="compare">
  <h2>Feature by feature</h2>
  <p class="section-lead">What iD and Rapid have, and what each Maid editor has. A Maid column follows the modules its config switches on. Rows with a <em>docs</em> link have a README that explains the module and how to use it in your own editor.</p>
  <p class="legend"><span class="cell yes"><span class="mark"></span></span> yes <span class="cell partial"><span class="mark"></span></span> partly <span class="cell no"><span class="mark"></span></span> no</p>
${comparison(apps, repository)}
  <p class="source">iD and Rapid as of their main branches in November 2026, checked in their code. Full list with every module: <a href="https://github.com/${repository}/blob/main/docs/features.md">docs/features.md</a>.</p>
</section>

<section id="thanks">
  <div class="callout">
    <h2>Thank you, iD and Rapid</h2>
    <p>Maid exists because <a href="${ID_REPO}">iD</a> and <a href="${RAPID_REPO}">Rapid</a> did the hard work first. iD's maintainers and contributors built the editor most OpenStreetMap mappers start with, and the tagging schema, presets and validation rules that hold years of community knowledge. Rapid, now continued by Bryan Housel, rebuilt that editor on WebGL and gave it the clean data model Maid's own follows. We copied their behaviour on purpose, ported their tests, and compare against both in every benchmark. Thank you.</p>
  </div>
  <h2 class="thanks-title">Built with</h2>
  <p class="section-lead">Open source projects Maid stands on. Two of them carry the map itself.</p>
${thanks()}
</section>
</main>
<footer>
  <p>Maid is open source under the ISC licence: <a href="https://github.com/${repository}">${repository}</a>. Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.</p>
</footer>
</body>
</html>
`
}

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #fafaf7; --surface: #ffffff; --surface-2: #f3f4ee; --text: #1c1f17; --muted: #5d6356; --line: #e3e5dc;
  --accent: #4f7a1f; --accent-soft: #e6ebbf; --accent-strong: #3d6115; --yes: #4f9a2a; --partial: #d59a17; --no: #c9ccc2;
  --radius: 14px; --shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px rgb(30 40 10 / 0.06);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #121410; --surface: #1a1d17; --surface-2: #22261e; --text: #eef0e8; --muted: #a3a99a; --line: #2f3429;
    --accent: #a6d36b; --accent-soft: #2c3a1b; --accent-strong: #c3e58f; --yes: #86c75a; --partial: #e8b33d; --no: #3b4135;
    --shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 8px 24px rgb(0 0 0 / 0.25);
  }
}
:root[data-theme="dark"] {
  --bg: #121410; --surface: #1a1d17; --surface-2: #22261e; --text: #eef0e8; --muted: #a3a99a; --line: #2f3429;
  --accent: #a6d36b; --accent-soft: #2c3a1b; --accent-strong: #c3e58f; --yes: #86c75a; --partial: #e8b33d; --no: #3b4135;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-underline-offset: 2px; }
a:hover { color: var(--accent-strong); }
h1, h2, h3 { line-height: 1.15; letter-spacing: -0.01em; margin: 0; }
main { max-width: 72rem; margin: 0 auto; padding: 0 16px; }
section { padding: 4rem 0 1rem; scroll-margin-top: 3.5rem; }
h2 { font-size: clamp(1.6rem, 3vw, 2.1rem); margin-bottom: 0.6rem; }
.section-lead { color: var(--muted); max-width: 46rem; margin: 0 0 1.8rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 16px; background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: var(--text); text-decoration: none; }
.brand svg { width: 28px; height: auto; }
.top nav { display: flex; gap: 1.1rem; overflow-x: auto; }
.top nav a { color: var(--muted); text-decoration: none; font-size: 0.94rem; white-space: nowrap; }
.top nav a:hover { color: var(--text); }

.hero { padding-top: 4.5rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; font-weight: 700; color: var(--accent); margin: 0 0 0.8rem; }
.hero h1 { font-size: clamp(2.2rem, 6vw, 3.8rem); max-width: 16ch; }
.lead { font-size: clamp(1.05rem, 2vw, 1.25rem); color: var(--muted); max-width: 44rem; margin: 1.2rem 0 1.8rem; }
.actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.button { display: inline-flex; align-items: center; padding: 0.55rem 1rem; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--text); text-decoration: none; font-weight: 600; font-size: 0.95rem; }
.button:hover { border-color: var(--accent); color: var(--text); }
.button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.button.primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--bg); }
.numbers { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1px; margin-top: 3rem; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.number { background: var(--surface); padding: 1.2rem 1.3rem; display: flex; flex-direction: column; gap: 0.2rem; }
.number strong { font-size: 2rem; color: var(--accent); font-variant-numeric: tabular-nums; }
.number span { color: var(--muted); font-size: 0.92rem; }
.source { color: var(--muted); font-size: 0.85rem; margin-top: 0.8rem; }

.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); gap: 1.1rem; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.3rem; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 0.9rem; }
.shot { display: block; margin: -1.3rem -1.3rem 0.2rem; border-bottom: 1px solid var(--line); border-radius: var(--radius) var(--radius) 0 0; overflow: hidden; background: #000; }
.shot img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; transition: transform 0.3s ease; }
.shot:hover img { transform: scale(1.02); }
.tile-head { display: flex; gap: 0.9rem; align-items: center; }
.logo svg { width: 52px; height: auto; display: block; }
.tile h3 { font-size: 1.25rem; }
.detail { margin: 0.15rem 0 0; color: var(--accent); font-weight: 600; font-size: 0.92rem; }
.description { margin: 0; color: var(--muted); }
.highlights { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.45rem; font-size: 0.94rem; }
.highlights li { padding-left: 1.3rem; position: relative; }
.highlights li::before { content: ""; position: absolute; left: 0.2rem; top: 0.55em; width: 0.5rem; height: 0.5rem; border-radius: 2px; background: var(--accent); }
.tile .actions { margin-top: auto; }

.strengths { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: 1.1rem; }
.strength { background: var(--surface-2); border-radius: var(--radius); padding: 1.3rem; }
.strength h3 { font-size: 1.08rem; margin-bottom: 0.45rem; }
.strength p { margin: 0; color: var(--muted); font-size: 0.95rem; }

.legend { display: flex; align-items: center; gap: 0.4rem; color: var(--muted); font-size: 0.9rem; flex-wrap: wrap; }
.legend .cell { display: inline-flex; width: auto; margin-left: 0.6rem; }
.legend .cell:first-child { margin-left: 0; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.compare { border-collapse: collapse; width: 100%; min-width: 46rem; font-size: 0.92rem; }
.compare thead th { position: sticky; top: 0; background: var(--surface); z-index: 1; padding: 0.8rem 0.5rem; border-bottom: 1px solid var(--line); font-size: 0.85rem; }
.compare thead a { color: var(--text); text-decoration: none; }
.compare thead a:hover { color: var(--accent); }
.compare th.corner { text-align: left; padding-left: 1rem; }
.compare th.ref { background: var(--surface-2); }
.compare .group th { text-align: left; background: var(--accent-soft); padding: 0.7rem 1rem; font-size: 0.98rem; }
.compare .group .intro { display: block; font-weight: 400; color: var(--muted); font-size: 0.86rem; }
.compare tbody th[scope="row"] { text-align: left; font-weight: 400; padding: 0.7rem 1rem; max-width: 28rem; }
.compare tbody tr + tr th, .compare tbody tr + tr td { border-top: 1px solid var(--line); }
.feature { font-weight: 650; }
.docs { font-size: 0.78rem; margin-left: 0.3rem; }
.text { display: block; color: var(--muted); font-size: 0.86rem; margin-top: 0.15rem; }
.note { display: block; color: var(--muted); font-size: 0.8rem; font-style: italic; margin-top: 0.15rem; }
.cell { text-align: center; width: 4.6rem; position: relative; }
td.cell:nth-of-type(1), td.cell:nth-of-type(2) { background: var(--surface-2); }
.mark { display: inline-block; width: 0.85rem; height: 0.85rem; border-radius: 50%; vertical-align: middle; }
.yes .mark { background: var(--yes); }
.partial .mark { background: linear-gradient(90deg, var(--partial) 50%, transparent 50%); box-shadow: inset 0 0 0 2px var(--partial); }
.no .mark { width: 0.6rem; height: 2px; border-radius: 1px; background: var(--no); }

.callout { margin-top: 1rem; padding: clamp(1.4rem, 4vw, 2.6rem); border-radius: calc(var(--radius) + 6px); background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.callout p { font-size: 1.08rem; max-width: 50rem; margin: 0.8rem 0 0; }
.thanks-title { margin-top: 3.5rem; }
.thanks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 0.8rem; }
.thanks li { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; }
.thanks a { font-weight: 650; }
.thanks span { color: var(--muted); font-size: 0.88rem; }
.thanks .thanks-top { grid-column: span 2; border-color: var(--accent); }
.thanks .thanks-top a { font-size: 1.15rem; }
@media (max-width: 40rem) { .thanks .thanks-top { grid-column: auto; } .top nav a:nth-child(-n+3) { display: none; } }

footer { max-width: 72rem; margin: 4rem auto 0; padding: 2rem 16px 3rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.88rem; }
`
