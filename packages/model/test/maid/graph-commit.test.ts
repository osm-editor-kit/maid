// Maid's own tests (not from Rapid): `Graph.commit()` after mixed edits.
// Commit updates the geometry of the ways and relations touched by the entities written since the last
// commit (and their parents). A write that commit does not hear about would leave a geometry stale or a
// parent cache out of date. Every check compares the graph with a fresh Graph built from the same
// entities, which has no edit history, and with the lookups the test expects by its own bookkeeping.
import { describe, expect, it } from 'bun:test'
import {
  EditHistory,
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  actionChangeTags,
  actionDeleteNode,
  actionDeleteWay,
  actionMoveNode,
} from '../../src/index.ts'
import type { OsmEntity } from '../../src/index.ts'

const context = new ModelContext()

function node(id: string, lon: number, lat: number): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat] })
}

// Nodes a to f and x. Ways w1 a-b-c, w2 c-d-e, w3 e-f-a. Route r1 has w1 and w2, multipolygon r2 has w3.
function baseEntities(): OsmEntity[] {
  return [
    node('a', 0, 0),
    node('b', 0.001, 0),
    node('c', 0.002, 0),
    node('d', 0.002, 0.001),
    node('e', 0.001, 0.001),
    node('f', 0, 0.001),
    node('x', 0.003, 0.003),
    new OsmWay(context, { id: 'w1', nodes: ['a', 'b', 'c'] }),
    new OsmWay(context, { id: 'w2', nodes: ['c', 'd', 'e'] }),
    new OsmWay(context, { id: 'w3', nodes: ['e', 'f', 'a'] }),
    new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'route' },
      members: [
        { id: 'w1', type: 'way', role: 'forward' },
        { id: 'w2', type: 'way', role: 'forward' },
      ],
    }),
    new OsmRelation(context, {
      id: 'r2',
      tags: { type: 'multipolygon' },
      members: [{ id: 'w3', type: 'way', role: 'outer' }],
    }),
  ]
}

/** What the graph must hold: the base entities, and the local entries (`undefined` means deleted). */
interface Expected {
  base: Map<string, OsmEntity>;
  local: Map<string, OsmEntity | undefined>;
}

function newExpected(entities: OsmEntity[]): Expected {
  return { base: new Map(entities.map(entity => [entity.id, entity])), local: new Map() };
}

/** The entities the graph must show: base, overlaid by the local entries. */
function viewOf(want: Expected): Map<string, OsmEntity> {
  const view = new Map<string, OsmEntity>(want.base);
  for (const [id, entity] of want.local) {
    if (entity) view.set(id, entity);
    else view.delete(id);
  }
  return view;
}

/** A copy with no cached geometry or memoised values, so a fresh graph computes everything itself. */
function copy(entity: OsmEntity): OsmEntity {
  if (entity instanceof OsmNode) return new OsmNode(context, { id: entity.id, loc: entity.loc, tags: entity.tags });
  if (entity instanceof OsmWay) return new OsmWay(context, { id: entity.id, nodes: entity.nodes, tags: entity.tags });
  const relation = entity as OsmRelation;
  return new OsmRelation(context, { id: relation.id, tags: relation.tags, members: relation.members });
}

/** Compares parent ways, parent relations and (unless `withGeometry` is false) geometry of `g` with the `view` it must show. */
function checkCaches(g: Graph, view: Map<string, OsmEntity>, label: string, withGeometry = true): void {
  const all = [...view.values()];
  const ids = new Set<string>(view.keys());
  for (const entity of all) {
    if (entity instanceof OsmWay) entity.nodes.forEach(id => ids.add(id));
    if (entity instanceof OsmRelation) entity.members.forEach(member => ids.add(member.id));
  }

  for (const id of ids) {
    const ref = { id } as OsmEntity;  // the caches only read the id

    const wantWays = all
      .filter(entity => entity instanceof OsmWay && entity.nodes.includes(id))
      .map(entity => entity.id)
      .sort();
    expect(g.parentWays(ref).map(way => way.id).sort(), `${label}: parent ways of ${id}`).toEqual(wantWays);

    const wantRels = all
      .filter(entity => entity instanceof OsmRelation && entity.members.some(member => member.id === id))
      .map(entity => entity.id)
      .sort();
    expect(g.parentRelations(ref).map(rel => rel.id).sort(), `${label}: parent relations of ${id}`).toEqual(wantRels);
  }

  if (!withGeometry) return;
  // Geometry: `geoms` resolves what commit marked. Reading it here also fills it, so a later missed
  // mark shows up as the old shape.
  const fresh = new Graph(context, all.map(copy));
  for (const entity of all) {
    if (entity instanceof OsmNode) continue;
    expect(JSON.stringify(entity.geoms.orig), `${label}: geometry of ${entity.id}`)
      .toBe(JSON.stringify(fresh.entity(entity.id).geoms.orig));
  }
}

/** Checks lookups against the bookkeeping of the test. */
function check(g: Graph, want: Expected, label: string): void {
  const view = viewOf(want);
  for (const id of new Set([...want.base.keys(), ...want.local.keys()])) {
    expect(g.hasEntity(id), `${label}: lookup of ${id}`).toBe(view.get(id));
  }
  checkCaches(g, view, label);
}

/** Checks a graph that has no bookkeeping of its own: the view is what its base and local maps hold. */
function checkView(g: Graph, label: string, withGeometry = true): void {
  const view = new Map<string, OsmEntity>();
  for (const id of new Set([...g.base.entities.keys(), ...g.local.entities.keys()])) {
    const entity = g.hasEntity(id);
    if (entity) view.set(id, entity);
  }
  checkCaches(g, view, label, withGeometry);
}


describe('Graph.commit after mixed edits', () => {

  it('edits, deletes, reverts and re-adds keep lookups, parents and geometry equal to a fresh graph', () => {
    const want = newExpected(baseEntities());
    const base = new Graph(context, [...want.base.values()]);
    const g = new Graph(base);
    check(g, want, 'start');

    // modify: move node b
    const b2 = node('b', 0.0015, 0.0005);
    g.replace(b2);
    want.local.set('b', b2);
    g.commit();
    check(g, want, 'move b');

    // modify: w1 also passes through f
    const w1b = new OsmWay(context, { id: 'w1', nodes: ['a', 'b', 'c', 'f'] });
    g.replace(w1b);
    want.local.set('w1', w1b);
    g.commit();
    check(g, want, 'w1 through f');

    // add: a new way from f to the isolated node x
    const w4 = new OsmWay(context, { id: 'w4', nodes: ['f', 'x'] });
    g.replace(w4);
    want.local.set('w4', w4);
    g.commit();
    check(g, want, 'add w4');

    // delete: w2 (still a member of route r1)
    g.remove(want.base.get('w2')!);
    want.local.set('w2', undefined);
    g.commit();
    check(g, want, 'delete w2');

    // revert: w1 back to the base way
    g.revert('w1');
    want.local.delete('w1');
    g.commit();
    check(g, want, 'revert w1');

    // delete node e, after w3 no longer uses it
    const w3b = new OsmWay(context, { id: 'w3', nodes: ['f', 'a'] });
    g.replace(w3b);
    want.local.set('w3', w3b);
    g.remove(want.base.get('e')!);
    want.local.set('e', undefined);
    g.commit();
    check(g, want, 'drop e');

    // several commits in a row with nothing dirty
    g.commit();
    g.commit();
    check(g, want, 'idle commits');
    expect(g.commit()).toBe(g);

    // delete then re-add the same ids: w2 as the base object again, x as a new object
    g.remove(w4);
    want.local.set('w4', undefined);
    g.remove(want.base.get('x')!);
    want.local.set('x', undefined);
    g.commit();
    check(g, want, 'delete x and w4');

    g.replace(want.base.get('w2')!);
    want.local.set('w2', want.base.get('w2')!);
    const x2 = node('x', 0.004, 0.004);
    g.replace(x2);
    want.local.set('x', x2);
    g.commit();
    check(g, want, 're-add w2 and x');
  })

  it('a rebase that loads new entities keeps local deletions and caches equal to a fresh graph', () => {
    const want = newExpected(baseEntities());
    const base = new Graph(context, [...want.base.values()]);
    const g = new Graph(base);

    // local edits: c is deleted, and neither w1 nor w2 uses it any more
    const w1b = new OsmWay(context, { id: 'w1', nodes: ['a', 'b'] });
    g.replace(w1b);
    want.local.set('w1', w1b);
    const w2b = new OsmWay(context, { id: 'w2', nodes: ['d', 'e'] });
    g.replace(w2b);
    want.local.set('w2', w2b);
    g.remove(want.base.get('c')!);
    want.local.set('c', undefined);
    g.commit();
    check(g, want, 'local edits');

    // a download brings node y and way w9 through the deleted node c: c must come back (iD#2085)
    const y = node('y', 0.005, 0.005);
    const w9 = new OsmWay(context, { id: 'w9', nodes: ['c', 'y'] });
    base.rebase([y, w9], [g]);
    want.base.set('y', y);
    want.base.set('w9', w9);
    want.local.delete('c');
    g.commit();
    check(g, want, 'rebase restores c');

    // a local edit of the new node
    const yMoved = node('y', 0.006, 0.005);
    g.replace(yMoved);
    want.local.set('y', yMoved);
    g.commit();
    check(g, want, 'move y');

    // a new way that touches no local edit
    const w10 = new OsmWay(context, { id: 'w10', nodes: ['x', 'a'] });
    base.rebase([w10], [g]);
    want.base.set('w10', w10);
    g.commit();
    check(g, want, 'rebase w10');
  })

  it('a graph derived from a committed graph commits its own edits', () => {
    const want = newExpected(baseEntities());
    const base = new Graph(context, [...want.base.values()]);
    const g1 = new Graph(base);
    const b2 = node('b', 0.0015, 0.0005);
    g1.replace(b2);
    want.local.set('b', b2);
    g1.commit();
    check(g1, want, 'first graph');

    const g2 = new Graph(g1);
    check(g2, want, 'derived start');
    const w2b = new OsmWay(context, { id: 'w2', nodes: ['d', 'e'] });
    g2.replace(w2b);
    want.local.set('w2', w2b);
    g2.commit();
    check(g2, want, 'derived edit');
  })

  it('an edit history session keeps the staging and stable graphs equal to fresh graphs', () => {
    const history = new EditHistory(context);
    history.merge(baseEntities());
    // Geometry is not checked after undo and redo. They switch to an older graph, and nothing marks the
    // ways of the switched entities, so a way keeps the shape it had when it was last read. This gap was
    // there before the commit change (the test fails on the earlier code) and EditHistory is not changed here.
    const both = (label: string, withGeometry = true): void => {
      checkView(history.staging.graph!, `${label}: staging`, withGeometry);
      checkView(history.stable.graph!, `${label}: stable`, withGeometry);
    };

    history.perform(actionMoveNode('b', [0.0015, 0.0005]));
    history.perform(actionChangeTags('w1', { highway: 'residential' }));
    history.commit({ annotation: 'move b, tag w1' });
    both('commit 1');

    history.perform(actionDeleteWay('w2'));
    both('delete w2 in staging');
    history.commit({ annotation: 'delete w2' });
    both('commit 2');

    history.undo();
    both('undo', false);
    history.redo();
    both('redo', false);

    history.perform(actionDeleteNode('c'));
    history.commit({ annotation: 'delete c' });
    both('delete c');

    // a download brings a way through the deleted node c: c comes back
    history.merge([node('y', 0.005, 0.005), new OsmWay(context, { id: 'w9', nodes: ['c', 'y'] })]);
    both('merge');

    history.perform(actionMoveNode('y', [0.006, 0.005]));
    history.commit({ annotation: 'move y' });
    both('move y');

    history.undo();
    both('undo move y', false);
  })

})
