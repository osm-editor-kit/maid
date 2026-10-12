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
import { getScene } from '../fixtures/scenes'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'
const scene = getScene(sceneName)

/** What one entity looks like in the data, the lookups and the map's sources */
type Seen = { inData: boolean; sources: string[]; ways: string[]; uses: number }
type Picked = { wayId: string; own: string[]; shared: string[] }

process.exit(
  await runCheck(sceneName, async ({ page, report, settle, drawnIn }) => {
    const engineCall = (method: string, ...args: unknown[]) =>
      page.evaluate(({ method, args }) => (window as any).__maid.engine[method](...args), {
        method,
        args,
      })
    /** Runs one step, waits for the map and reads the entities back */
    const after = async (run: () => Promise<unknown>, ids: string[]) => {
      await run()
      await settle()
      const sources = await drawnIn(ids)
      const data = (await page.evaluate((ids: string[]) => {
        const { engine } = (window as any).__maid
        const out: Record<string, { inData: boolean; ways: string[]; uses: number }> = {}
        for (const id of ids)
          out[id] = {
            inData: engine.data.history.staging.graph.hasEntity(id) !== undefined,
            ways: [...(engine.data.nodeWays.get(id) ?? [])].sort((a: string, b: string) =>
              a.localeCompare(b),
            ),
            uses: engine.data.nodeUses.get(id) ?? 0,
          }
        return { entities: out, undo: engine.undoState().undoLabel ?? null }
      }, ids)) as { entities: Record<string, Omit<Seen, 'sources'>>; undo: string | null }
      const seen: Record<string, Seen> = {}
      // the key order is part of the comparison (report compares JSON)
      for (const id of ids) {
        const entity = data.entities[id]!
        seen[id] = {
          inData: entity.inData,
          sources: sources[id]!,
          ways: entity.ways,
          uses: entity.uses,
        }
      }
      return { seen, undo: data.undo }
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
      return
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
  }),
)
