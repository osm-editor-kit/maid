/**
 * Create and delete check for Maid. Adds a point, changes its tags, deletes it, undoes; then
 * deletes a highway and undoes and redoes that. After every step it checks the data, the
 * renderer's lookups and what the map has in its sources against what the step should have left.
 *
 *   bun tools/bench/edit-check.ts [scene]
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

/** What one entity looks like in the data, the lookups and the map's sources */
type Seen = { inData: boolean; sources: string[]; ways: string[]; uses: number }
type Picked = { wayId: string; own: string[]; shared: string[] }

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

    const engineCall = (method: string, ...args: unknown[]) =>
      page.evaluate(({ method, args }) => (window as any).__maid.engine[method](...args), {
        method,
        args,
      })
    /** Runs one step, waits for the map and reads the entities back */
    const after = async (run: () => Promise<unknown>, ids: string[]) => {
      await run()
      await settle()
      return (await page.evaluate(
        ({ ids, pairs }) => {
          const { map, engine } = (window as any).__maid
          const out: Record<string, unknown> = {}
          for (const id of ids) {
            const sources: string[] = []
            for (const [name, base, live] of pairs) {
              const has = (source: string) =>
                map.getSource(source) &&
                map.querySourceFeatures(source).some((f: any) => String(f.id) === id)
              // a base copy that an edit replaced stays in its source, hidden by feature state
              const hidden = map.getFeatureState({ source: base, id })?.editing === true
              if (has(live) || (has(base) && !hidden)) sources.push(name)
            }
            out[id] = {
              inData: engine.data.history.staging.graph.hasEntity(id) !== undefined,
              sources,
              ways: [...(engine.data.nodeWays.get(id) ?? [])].sort((a: string, b: string) =>
                a.localeCompare(b),
              ),
              uses: engine.data.nodeUses.get(id) ?? 0,
            }
          }
          return { seen: out, undo: engine.undoState().undoLabel ?? null }
        },
        {
          ids,
          pairs: (Object.keys(EDIT_SOURCES) as (keyof typeof EDIT_SOURCES)[]).map(
            (name): [string, string, string] => [name, SOURCES[name], EDIT_SOURCES[name]],
          ),
        },
      )) as { seen: Record<string, Seen>; undo: string | null }
    }
    const gone: Seen = { inData: false, sources: [], ways: [], uses: 0 }
    const point: Seen = { inData: true, sources: ['points'], ways: [], uses: 0 }

    // --- a new point ---
    const [lon, lat] = scene.center
    let pointId = ''
    let s = await after(async () => {
      pointId = (await engineCall('addPoint', lon, lat, { amenity: 'bench' })) as string
    }, [])
    s = await after(async () => {}, [pointId])
    report('add point: id is negative', true, pointId.startsWith('n-'))
    report('add point: in the data and drawn as a point', point, s.seen[pointId])
    report('add point: undo label', 'Added a point', s.undo)

    s = await after(() => engineCall('setTags', pointId, {}), [pointId])
    report('remove its tags: a new point is drawn without tags too', point, s.seen[pointId])
    await engineCall('undo')

    s = await after(() => engineCall('setTags', pointId, { natural: 'tree' }), [pointId])
    report('change its tags: still one point', point, s.seen[pointId])

    s = await after(() => engineCall('deleteEntity', pointId), [pointId])
    report('delete point: gone from data and map', gone, s.seen[pointId])
    report('delete point: undo label', 'Deleted a node', s.undo)

    s = await after(() => engineCall('undo'), [pointId])
    report('undo delete: the point is back', point, s.seen[pointId])
    await engineCall('undo')
    s = await after(() => engineCall('undo'), [pointId])
    report('undo tags and creation: the point is gone', gone, s.seen[pointId])
    report('undo tags and creation: nothing left to undo', null, s.undo)

    // --- deleting a highway: nodes only it uses go with it, shared nodes stay ---
    const picked = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      for (const f of map.queryRenderedFeatures()) {
        const wayId = String(f.id ?? '')
        const way = wayId.startsWith('w') && engine.data.way(wayId)
        if (!way || !way.tags.highway || engine.data.wayMultipolygons.has(wayId)) continue
        const own: string[] = []
        const shared: string[] = []
        for (const nodeId of new Set<string>(way.nodes)) {
          const node = engine.data.node(nodeId)
          if (!node) continue
          const untagged = Object.keys(node.tags).length === 0
          if ((engine.data.nodeUses.get(nodeId) ?? 0) > 1) shared.push(nodeId)
          else if (untagged) own.push(nodeId)
        }
        if (own.length && shared.length) return { wayId, own, shared }
      }
      return null
    })) as Picked | null
    if (!picked) {
      report('find a highway with own and shared nodes', 'one in view', null)
      return 1
    }
    const ids = [picked.wayId, ...picked.own, ...picked.shared]
    const before = await after(async () => {}, ids)
    const sharedBefore = picked.shared.map((id) => before.seen[id])

    const checkDeleted = (label: string, now: Record<string, Seen>) => {
      report(`${label}: the way is gone`, gone, now[picked.wayId])
      report(
        `${label}: its own nodes are gone`,
        picked.own.map(() => gone),
        picked.own.map((id) => now[id]),
      )
      report(
        `${label}: shared nodes stay, without the way in their lookup`,
        sharedBefore.map((seen) => ({
          inData: true,
          ways: seen!.ways.filter((id) => id !== picked.wayId),
          uses: seen!.uses - 1,
        })),
        picked.shared.map((id) => ({
          inData: now[id]!.inData,
          ways: now[id]!.ways,
          uses: now[id]!.uses,
        })),
      )
    }

    s = await after(() => engineCall('deleteEntity', picked.wayId), ids)
    checkDeleted('delete way', s.seen)
    report('delete way: undo label', 'Deleted a way', s.undo)

    s = await after(() => engineCall('undo'), ids)
    report('undo delete way: data, lookups and map as before', before.seen, s.seen)

    s = await after(() => engineCall('redo'), ids)
    checkDeleted('redo delete way', s.seen)

    s = await after(() => engineCall('undo'), ids)
    report('undo again: data, lookups and map as before', before.seen, s.seen)

    report('no request outside localhost', {}, Object.fromEntries(blocked))
    return failed ? 1 : 0
  } finally {
    await browser.close()
  }
}

process.exit(await main())
