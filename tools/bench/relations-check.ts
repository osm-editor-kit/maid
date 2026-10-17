/**
 * Relations check for Maid. Adds a way to a relation, changes its role and removes it again, the
 * way a module does it: straight through `editor.history`. Then highlights related features (a
 * selected relation, `engine.setRelated`), loads a relation in full from the mock API (one request),
 * zooms to a member and to a relation. Last, moves a node of a multipolygon's member way and checks
 * that the drawn area follows.
 *
 *   bun tools/bench/relations-check.ts [scene]
 *
 * Needs `bun run dev` (the mock API answers the relation load). The multipolygon part needs one in
 * view: the dense scene has it, the small one skips it. The load part needs a relation with members
 * that the map has not loaded but the fixture has: the fixture is read here to find one.
 */
import { SOURCES } from '../../packages/renderer/src/layers'
import { loadScenes } from '../mock-osm-api/server'
import { PORTS } from '../ports'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

process.exit(
  await runCheck(sceneName, async ({ page, report, settle, drawnIn }) => {
    // --- membership, edited through the history like a module would ---
    const picked = (await page.evaluate(() => {
      const { map, engine, editor } = window.__maid
      const graph = editor.history.staging.graph
      let relationId: string | undefined
      let wayId: string | undefined
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way) continue
        const parents = graph.parentRelations(way)
        if (!relationId && parents.length) relationId = parents[0]!.id
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
        const { engine } = window.__maid
        const relation = engine.data.relation(relationId)!
        const at = relation.members.findIndex((m: any) => m.id === wayId)
        return {
          count: relation.members.length,
          role: at < 0 ? null : relation.members[at]!.role,
          undo: engine.undoState().undoLabel ?? null,
        }
      }, picked)
    const edit = async (kind: 'add' | 'role' | 'remove') => {
      await page.evaluate(
        ({ relationId, wayId, kind }) => {
          const { editor, engine } = window.__maid
          const { history } = editor
          const relation = engine.data.relation(relationId)!
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
      const { engine } = window.__maid
      engine.undo()
      engine.undo()
      engine.undo()
    })
    await settle()
    report('undo three times: as before', before, await members())

    // --- the same in the sidebar: select a member, remove it from its relation, undo ---
    const member = (await page.evaluate(() => {
      const { map, engine, editor } = window.__maid
      const graph = editor.history.staging.graph
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        const parents = way ? graph.parentRelations(way) : []
        if (parents.length === 1) return { wayId: id, relationId: parents[0]!.id }
      }
      return null
    })) as { wayId: string; relationId: string } | null
    if (member) {
      const parents = () =>
        page.evaluate((wayId) => {
          const { editor } = window.__maid
          const graph = editor.history.staging.graph
          return graph.parentRelations(graph.entity(wayId)).length
        }, member.wayId)
      await page.evaluate((id) => window.__bench.select(id), member.wayId)
      // the "Relations" group starts folded: its rows exist only once it is open
      const toggle = page.locator('[data-stack-heading] button[aria-controls]', {
        hasText: 'Relations',
      })
      if ((await toggle.first().getAttribute('aria-expanded')) !== 'true')
        await toggle.first().click()
      const remove = page.getByRole('button', { name: `Remove from ${member.relationId}` })
      report('sidebar: the membership is listed with a remove button', 1, await remove.count())
      await remove.first().click()
      await settle()
      report('sidebar: remove takes the way out of the relation', 0, await parents())
      report('sidebar: the row is gone', 0, await remove.count())
      await page.evaluate(() => window.__maid.engine.undo())
      await settle()
      report(
        'sidebar: undo puts it back, and the row with it',
        [1, 1],
        [await parents(), await remove.count()],
      )
      await page.evaluate(() => window.__bench.select(null))
    }

    // --- related features: a selected relation's members, and what the inspector asks for ---
    const membersOf = (relationId: string) =>
      page.evaluate((relationId) => {
        const { editor, engine } = window.__maid
        const graph = editor.history.staging.graph
        const relation = engine.data.relation(relationId)
        if (!relation) return []
        return relation.members.filter((m: any) => graph.hasEntity(m.id)).map((m: any) => m.id)
      }, relationId) as Promise<string[]>
    /** Per id: whether it is drawn on the map and whether it carries the `related` state */
    const relatedStates = async (ids: string[]) => {
      const drawn = await drawnIn(ids)
      return page.evaluate(
        ({
          drawn,
          sources,
        }: {
          drawn: Record<string, string[]>
          sources: Record<string, string>
        }) => {
          const { map } = window.__maid
          const out: Record<string, { drawn: boolean; related: boolean }> = {}
          for (const [id, kinds] of Object.entries(drawn)) {
            out[id] = {
              drawn: kinds.length > 0,
              related: kinds.some(
                // kinds are the keys of SOURCES (drawnIn in check-page.ts), so each has a source
                (kind) => map.getFeatureState({ source: sources[kind]!, id })?.related === true,
              ),
            }
          }
          return out
        },
        { drawn, sources: SOURCES },
      ) as Promise<Record<string, { drawn: boolean; related: boolean }>>
    }
    const relatedCount = (states: Record<string, { related: boolean }>) =>
      Object.values(states).filter((state) => state.related).length
    const loaded = await membersOf(picked.relationId)
    if (loaded.length > 0) {
      // a relation is not drawn, so `__bench.select` (which waits for the map to show it) would never return
      await page.evaluate((id) => window.__maid.engine.setSelected(id), picked.relationId)
      await settle()
      const selected = await relatedStates(loaded)
      const drawnMembers = loaded.filter((id) => selected[id]!.drawn)
      report(
        'select a relation: its drawn members are related',
        [true, true],
        [drawnMembers.length > 0, drawnMembers.every((id) => selected[id]!.related)],
      )
      await page.evaluate(() => window.__maid.engine.setSelected(null))
      await settle()
      report(
        'deselect: the members are no longer related',
        0,
        relatedCount(await relatedStates(drawnMembers)),
      )
      await page.evaluate((ids) => window.__maid.engine.setRelated(ids), drawnMembers)
      await settle()
      report(
        'setRelated(ids): exactly those are related',
        drawnMembers.length,
        relatedCount(await relatedStates(drawnMembers)),
      )
      await page.evaluate(() => window.__maid.engine.setRelated(null))
      await settle()
      report(
        'setRelated(null): none of them is related',
        0,
        relatedCount(await relatedStates(drawnMembers)),
      )
    }

    // --- load a relation in full: the members the map has not loaded, from the mock API ---
    const candidates = (await page.evaluate(() => {
      const { engine } = window.__maid
      const graph = engine.data.history.staging.graph
      return engine.data
        .all()
        .relations.map((relation: any) => ({
          id: relation.id as string,
          members: relation.members.map((m: any) => m.id as string),
          missing: relation.members
            .filter((m: any) => !graph.hasEntity(m.id))
            .map((m: any) => m.id as string),
        }))
        .filter((candidate: any) => candidate.missing.length > 0)
    })) as { id: string; members: string[]; missing: string[] }[]
    // the fixture (read here, no request): which of the missing members the mock answers for
    const scene = (await loadScenes([sceneName])).get(sceneName)!
    const answered = (relationId: string) => {
      const json = scene.full('relation', Number(relationId.slice(1)))
      if (!json) return new Set<string>()
      return new Set(
        (JSON.parse(json).elements as { type: string; id: number }[]).map(
          (e) => `${e.type[0]}${e.id}`,
        ),
      )
    }
    let target: { id: string; members: string[]; reachable: string[] } | undefined
    for (const candidate of candidates) {
      const keys = answered(candidate.id)
      const reachable = candidate.missing.filter((id) => keys.has(id))
      if (reachable.length > 0 && (!target || reachable.length > target.reachable.length))
        target = { id: candidate.id, members: candidate.members, reachable }
    }
    if (!target) {
      report('a relation with members the map has not loaded, that the mock has', 'found', null)
    } else {
      const reachable = target.reachable
      const inGraph = () =>
        page.evaluate((ids) => {
          const { editor } = window.__maid
          const graph = editor.history.staging.graph
          return ids.filter((id: string) => graph.hasEntity(id)).length
        }, target!.members)
      const countBefore = await inGraph()
      await fetch(`http://localhost:${PORTS.mockApi}/requests/reset`)
      // two calls at once: one request, both get the same answer
      const answers = (await page.evaluate(async (id) => {
        const { engine } = window.__maid
        const [a, b] = await Promise.all([engine.loadRelation(id), engine.loadRelation(id)])
        return [a, b]
      }, target.id)) as { added: number }[]
      await settle()
      const log = (await (await fetch(`http://localhost:${PORTS.mockApi}/requests`)).json()) as {
        path: string
      }[]
      const number = target.id.slice(1)
      report(
        'load a relation: two calls at once make one request to its full answer and one for its parent relations, as iD',
        [1, 1],
        [
          log.filter((r) => r.path.endsWith(`/api/0.6/relation/${number}/full.json`)).length,
          log.filter((r) => r.path.endsWith(`/api/0.6/relation/${number}/relations.json`)).length,
        ],
      )
      report(
        'load a relation: both calls get the same answer, which adds entities',
        [answers[0], true],
        [answers[1], answers[0]!.added > 0],
      )
      const countAfter = await inGraph()
      report(
        'load a relation: its missing members are in the graph now',
        countBefore + reachable.length,
        countAfter,
      )
      const failure = await page.evaluate(() =>
        window.__maid.engine.loadRelation('r999999999').then(
          () => 'resolved',
          (error: Error) => error.message,
        ),
      )
      report(
        'a relation the API does not have: rejects with the status',
        'OSM API answered 404',
        failure,
      )

      // --- zoom to a member, and to the relation: the map has to show them ---
      const member = await page.evaluate((ids) => {
        const { engine } = window.__maid
        for (const id of ids) {
          const loc =
            id[0] === 'n'
              ? engine.data.node(id)?.loc
              : id[0] === 'w'
                ? engine.data.node(engine.data.way(id)?.nodes[0] ?? '')?.loc
                : undefined
          if (loc) return { id, loc: [loc[0], loc[1]] satisfies [number, number] }
        }
        return null
      }, target.members)
      if (member) {
        // far away first, so that the move is real
        await page.evaluate(() => window.__maid.map.jumpTo({ center: [0, 0], zoom: 2 }))
        await settle()
        const inView = (loc: [number, number]) =>
          page.evaluate((loc) => window.__maid.map.getBounds().contains(loc), loc)
        const fitted = await page.evaluate((id) => window.__maid.engine.fitTo([id]), member.id)
        await settle()
        report(
          'zoom to a member: the map shows it',
          [true, true],
          [fitted, await inView(member.loc)],
        )
        await page.evaluate(() => window.__maid.map.jumpTo({ center: [0, 0], zoom: 2 }))
        await settle()
        const fittedRelation = await page.evaluate(
          (id) => window.__maid.engine.fitTo([id]),
          target.id,
        )
        await settle()
        report(
          'zoom to a relation: the map shows one of its members',
          [true, true],
          [fittedRelation, await inView(member.loc)],
        )
      }
      // the zoom to the relation above has all of them in view: they are drawn then
      const drawnNow = await relatedStates(reachable)
      report(
        'load a relation: the loaded members are drawn',
        reachable.length,
        reachable.filter((id) => drawnNow[id]!.drawn).length,
      )
      report(
        'zoom to nothing loaded: no move',
        false,
        await page.evaluate(() => window.__maid.engine.fitTo(['n999999999'])),
      )
    }

    // --- a multipolygon is drawn from its member ways and follows them ---
    const multi = (await page.evaluate(() => {
      const { map, engine } = window.__maid
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
          const { map } = window.__maid
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
    const moved: [number, number] = [multi.loc[0]! + 0.0002, multi.loc[1]! + 0.0002]
    report(
      'multipolygon: its area has the corner where the node is',
      true,
      await hasCorner(multi.loc),
    )
    await page.evaluate(
      ({ nodeId, moved }) => window.__maid.engine.moveNode(nodeId, moved[0], moved[1]),
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
    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    report(
      'undo: the corner is back',
      [true, false],
      [await hasCorner(multi.loc), await hasCorner(moved)],
    )
  }),
)
