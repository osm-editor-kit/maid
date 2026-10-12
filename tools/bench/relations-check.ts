/**
 * Relations check for Maid. Adds a way to a relation, changes its role and removes it again, the
 * way a module does it: straight through `editor.history`. Then moves a node of a multipolygon's
 * member way and checks that the drawn area follows.
 *
 *   bun tools/bench/relations-check.ts [scene]
 *
 * The multipolygon part needs one in view: the dense scene has it, the small one skips it.
 */
import { runCheck } from './check-page'

process.exit(
  await runCheck(process.argv[2] ?? 'small', async ({ page, report, settle, drawnIn }) => {
    // --- membership, edited through the history like a module would ---
    const picked = (await page.evaluate(() => {
      const { map, engine, editor } = (window as any).__maid
      const graph = editor.history.staging.graph
      let relationId: string | undefined
      let wayId: string | undefined
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way) continue
        const parents = graph.parentRelations(way)
        if (!relationId && parents.length) relationId = parents[0].id
        else if (!wayId && way.tags.highway && parents.length === 0) wayId = id
        if (relationId && wayId) break
      }
      return relationId && wayId ? { relationId, wayId } : null
    })) as { relationId: string; wayId: string } | null
    if (!picked) {
      report('find a relation and a way that is in none', 'both in view', null)
      return
    }
    const members = () =>
      page.evaluate(({ relationId, wayId }) => {
        const { editor, engine } = (window as any).__maid
        const relation = editor.history.staging.graph.entity(relationId)
        const at = relation.members.findIndex((m: any) => m.id === wayId)
        return {
          count: relation.members.length,
          role: at < 0 ? null : relation.members[at].role,
          undo: engine.undoState().undoLabel ?? null,
        }
      }, picked)
    const edit = async (kind: 'add' | 'role' | 'remove') => {
      await page.evaluate(
        ({ relationId, wayId, kind }) => {
          const { editor } = (window as any).__maid
          const { history } = editor
          const relation = history.staging.graph.entity(relationId)
          const at = relation.members.findIndex((m: any) => m.id === wayId)
          // an action is a function from graph to graph: these do what the member actions do
          const next =
            kind === 'add'
              ? relation.addMember({ id: wayId, type: 'way', role: '' })
              : kind === 'role'
                ? relation.updateMember({ role: 'forward' }, at)
                : relation.removeMember(at)
          history.perform((graph: any) => graph.replace(next).commit())
          history.commit({ annotation: `Member: ${kind}`, selectedIDs: [wayId] })
        },
        { ...picked, kind },
      )
      await settle()
    }
    const before = await members()
    await edit('add')
    report(
      'add member: one more member, empty role, undo step',
      [before.count + 1, '', 'Member: add'],
      Object.values(await members()),
    )
    await edit('role')
    report(
      'change role',
      [before.count + 1, 'forward', 'Member: role'],
      Object.values(await members()),
    )
    await edit('remove')
    report('remove member', [before.count, null, 'Member: remove'], Object.values(await members()))
    await page.evaluate(() => {
      const { engine } = (window as any).__maid
      engine.undo()
      engine.undo()
      engine.undo()
    })
    await settle()
    report('undo three times: as before', before, await members())

    // --- the same in the sidebar: select a member, remove it from its relation, undo ---
    const member = (await page.evaluate(() => {
      const { map, engine, editor } = (window as any).__maid
      const graph = editor.history.staging.graph
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        const parents = way ? graph.parentRelations(way) : []
        if (parents.length === 1) return { wayId: id, relationId: parents[0].id as string }
      }
      return null
    })) as { wayId: string; relationId: string } | null
    if (member) {
      const parents = () =>
        page.evaluate((wayId) => {
          const { editor } = (window as any).__maid
          const graph = editor.history.staging.graph
          return graph.parentRelations(graph.entity(wayId)).length
        }, member.wayId)
      await page.evaluate((id) => (window as any).__bench.select(id), member.wayId)
      const remove = page.getByRole('button', { name: `Remove from ${member.relationId}` })
      report('sidebar: the membership is listed with a remove button', 1, await remove.count())
      await remove.first().click()
      await settle()
      report('sidebar: remove takes the way out of the relation', 0, await parents())
      report('sidebar: the row is gone', 0, await remove.count())
      await page.evaluate(() => (window as any).__maid.engine.undo())
      await settle()
      report(
        'sidebar: undo puts it back, and the row with it',
        [1, 1],
        [await parents(), await remove.count()],
      )
      await page.evaluate(() => (window as any).__bench.select(null))
    }

    // --- a multipolygon is drawn from its member ways and follows them ---
    const multi = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      // every multipolygon that has an area, in view or not: the small scene has few
      for (const f of map.querySourceFeatures('osm-areas')) {
        const id = String(f.id ?? '')
        const relation = id.startsWith('r') && engine.data.relation(id)
        if (!relation) continue
        // a node of an outer way that is in view: the map only has tiles for what it shows
        const bounds = map.getBounds()
        for (const member of relation.members) {
          const way = member.type === 'way' && member.role !== 'inner' && engine.data.way(member.id)
          for (const nodeId of way ? way.nodes : []) {
            const loc = engine.data.node(nodeId)?.loc
            if (loc && bounds.contains(loc)) return { relationId: id, nodeId, loc: [...loc] }
          }
        }
      }
      return null
    })) as { relationId: string; nodeId: string; loc: number[] } | null
    if (!multi) {
      // not a failure: the small scene has no multipolygon in view, the dense one has
      console.log('skip multipolygon: none with a node in view')
      return
    }
    /** How many times the position appears in the drawn area of the relation */
    const hasCorner = (loc: number[]) =>
      page.evaluate(
        ({ relationId, loc }) => {
          const { map } = (window as any).__maid
          const near = (c: number[]) =>
            Math.abs(c[0]! - loc[0]!) < 1e-5 && Math.abs(c[1]! - loc[1]!) < 1e-5
          const flat = (g: any): number[][] =>
            typeof g[0] === 'number' ? [g] : g.flatMap((part: any) => flat(part))
          for (const source of ['osm-areas-edit', 'osm-areas']) {
            const features = map
              .querySourceFeatures(source)
              .filter((f: any) => String(f.id) === relationId)
            if (features.length)
              return features.some((f: any) => flat(f.geometry.coordinates).some(near))
          }
          return false
        },
        { relationId: multi.relationId, loc },
      )
    const moved = [multi.loc[0]! + 0.0002, multi.loc[1]! + 0.0002]
    report(
      'multipolygon: its area has the corner where the node is',
      true,
      await hasCorner(multi.loc),
    )
    await page.evaluate(
      ({ nodeId, moved }) => (window as any).__maid.engine.moveNode(nodeId, moved[0], moved[1]),
      { nodeId: multi.nodeId, moved },
    )
    await settle()
    report(
      'move a member node: the area has the corner at the new place',
      [true, false],
      [await hasCorner(moved), await hasCorner(multi.loc)],
    )
    report(
      'move a member node: the relation is drawn once, as an area',
      ['areas'],
      (await drawnIn([multi.relationId]))[multi.relationId],
    )
    await page.evaluate(() => (window as any).__maid.engine.undo())
    await settle()
    report(
      'undo: the corner is back',
      [true, false],
      [await hasCorner(multi.loc), await hasCorner(moved)],
    )
  }),
)
