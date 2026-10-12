/**
 * Operations check for Maid: squares a building, splits a road at a vertex, merges the two parts
 * again and undoes everything. After every step it checks the data and the map's sources.
 *
 *   bun tools/bench/ops-check.ts [scene]
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on
 * any failure, including a request outside localhost.
 */
import { chromium } from '@playwright/test'
import { EDIT_SOURCES, SOURCES } from '../../packages/renderer/src/layers'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'

const sceneName = process.argv[2] ?? 'small'
const scene = getScene(sceneName)

type Way = { inData: boolean; nodes: string[]; drawnIn: string[] }
type Ran = { selection: string[] | null; undo: string | null; ways: Record<string, Way> }

async function main(): Promise<number> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  let failed = 0
  const report = (label: string, expected: unknown, actual: unknown) => {
    if (JSON.stringify(expected) === JSON.stringify(actual)) console.log(`ok ${label}`)
    else {
      failed++
      console.log(
        `FAIL ${label}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`,
      )
    }
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage()
    const blocked = new Map<string, number>()
    await context.route(
      (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
      (route) => {
        const host = new URL(route.request().url()).hostname
        blocked.set(host, (blocked.get(host) ?? 0) + 1)
        return route.abort()
      },
    )
    page.on('pageerror', (error) => report('no uncaught page error', 'none', error.message))

    await page.goto(
      `http://localhost:${PORTS.maid}/?scene=${sceneName}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`,
    )
    await page.waitForFunction(() => (window as any).__bench !== undefined, undefined, {
      timeout: 30000,
    })
    await page.evaluate(() => (window as any).__bench.ready())
    const settle = () => page.evaluate(() => (window as any).__bench.settled())
    await settle()

    /**
     * Selects `select`, runs the operation `id` (or undo, or nothing) and reads the ways back.
     * `watch` may name ways that only exist afterwards; the new selection is always read too.
     */
    const run = async (step: string | null, select: string[] | null, watch: string[]) => {
      const selection = (await page.evaluate(
        ({ step, select }) => {
          const { engine, editor } = (window as any).__maid
          if (select) engine.setSelected(select)
          if (step === 'undo') return engine.undo() ?? null
          if (!step) return null
          const operation = editor
            .registry('edit.operation')
            .list()
            .find((o: any) => o.id === step)
          return engine.runOperation(operation) ?? null
        },
        { step, select },
      )) as string[] | null
      await settle()
      return (await page.evaluate(
        ({ ids, selection, pairs }) => {
          const { map, engine } = (window as any).__maid
          const ways: Record<string, unknown> = {}
          for (const id of ids) {
            const way = engine.data.way(id)
            const drawnIn: string[] = []
            for (const [name, base, live] of pairs) {
              const has = (source: string) =>
                map.querySourceFeatures(source).some((f: any) => String(f.id) === id)
              const hidden = map.getFeatureState({ source: base, id })?.editing === true
              if (has(live) || (has(base) && !hidden)) drawnIn.push(name)
            }
            ways[id] = { inData: way !== undefined, nodes: way ? [...way.nodes] : [], drawnIn }
          }
          return { selection, undo: engine.undoState().undoLabel ?? null, ways }
        },
        {
          ids: [...new Set([...watch, ...(selection ?? []).filter((id) => id[0] === 'w')])],
          selection,
          pairs: (Object.keys(EDIT_SOURCES) as (keyof typeof EDIT_SOURCES)[]).map(
            (name): [string, string, string] => [name, SOURCES[name], EDIT_SOURCES[name]],
          ),
        },
      )) as Ran
    }
    const locations = (wayId: string) =>
      page.evaluate((wayId) => {
        const { engine } = (window as any).__maid
        return engine.data.way(wayId).nodes.map((id: string) => engine.data.node(id).loc.join())
      }, wayId) as Promise<string[]>

    // has the app the editor on its debug handle? the operations come from its registry
    const picked = (await page.evaluate(() => {
      const { map, engine, editor } = (window as any).__maid
      if (!editor) return { error: 'window.__maid.editor is missing' }
      const operation = (id: string) =>
        editor
          .registry('edit.operation')
          .list()
          .find((o: any) => o.id === id)
      const can = (id: string, selected: string[]) => {
        const context = { graph: engine.data.history.staging.graph, selected }
        const op = operation(id)
        return op && op.applies(context) && op.disabled(context) === undefined
      }
      let building: string | undefined
      let road: { wayId: string; vertex: string } | undefined
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way || engine.data.wayMultipolygons.has(id)) continue
        if (!building && way.tags.building && can('square', [id])) building = id
        if (!road && way.tags.highway && way.nodes.length >= 5) {
          // a vertex in the middle that only this way uses: the split makes exactly two ways
          const vertex = way.nodes
            .slice(1, -1)
            .find((n: string) => (engine.data.nodeUses.get(n) ?? 0) === 1 && can('split', [n]))
          if (vertex) road = { wayId: id, vertex }
        }
        if (building && road) break
      }
      return { building, road }
    })) as { error?: string; building?: string; road?: { wayId: string; vertex: string } }
    if (picked.error || !picked.building || !picked.road) {
      report('find a building to square and a road to split', 'both in view', picked)
      return 1
    }
    const { building, road } = picked

    // --- square a building ---
    const before = await locations(building)
    let r = await run('square', [building], [building])
    const squared = await locations(building)
    report('square: undo label', 'Squared the corners of a feature', r.undo)
    report(
      'square: nodes moved, same number of nodes',
      [true, before.length],
      [squared.some((loc, i) => loc !== before[i]), squared.length],
    )
    report('square: still drawn as an area', ['areas'], r.ways[building]?.drawnIn)
    r = await run('undo', null, [building])
    report('square, then undo: nodes are back', before, await locations(building))

    // --- split a road, merge the parts again ---
    const original = (await run(null, null, [road.wayId])).ways[road.wayId]!
    r = await run('split', [road.vertex], [road.wayId])
    const parts = (r.selection ?? []).filter((id) => id[0] === 'w')
    report('split: undo label', 'Split a line', r.undo)
    report(
      'split: two ways, both drawn as lines',
      [2, ['lines'], ['lines']],
      [parts.length, ...parts.map((id) => r.ways[id]?.drawnIn)],
    )
    const joined = parts.flatMap((id) => r.ways[id]?.nodes ?? [])
    report(
      'split: the parts have all nodes of the road, the vertex twice',
      [original.nodes.length + 1, 2],
      [joined.length, joined.filter((id) => id === road.vertex).length],
    )

    r = await run('merge', parts, parts)
    const kept = (r.selection ?? []).filter((id) => id[0] === 'w')
    report('merge: undo label', 'Merged 2 lines', r.undo)
    report(
      'merge: one way with the nodes of the road, drawn as a line',
      [1, original.nodes.length, ['lines']],
      [kept.length, r.ways[kept[0] ?? '']?.nodes.length, r.ways[kept[0] ?? '']?.drawnIn],
    )
    const gone = parts.filter((id) => id !== kept[0])
    report(
      'merge: the other part is gone from data and map',
      gone.map(() => ({ inData: false, nodes: [], drawnIn: [] })),
      gone.map((id) => r.ways[id]),
    )

    await run('undo', null, [])
    r = await run('undo', null, [road.wayId, ...parts])
    report('undo both: the road is as before', original, r.ways[road.wayId])
    report(
      'undo both: no part is left on the map',
      [],
      parts.filter((id) => id !== road.wayId && (r.ways[id]?.inData || r.ways[id]?.drawnIn.length)),
    )

    report('no request outside localhost', {}, Object.fromEntries(blocked))
    return failed ? 1 : 0
  } finally {
    await browser.close()
  }
}

process.exit(await main())
