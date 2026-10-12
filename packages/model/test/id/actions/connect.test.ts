// Adopted from iD test/spec/actions/connect.js (ISC, © iD contributors), at commit 0194f3926.
// Only the three survivor tests that pick the node by OSM id are here (F-actions-a-5). The other tests are covered by packages/model/test/actions/connect.test.js.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionConnect', () => {
  const context = new Rapid.MockContext();

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('chooses the oldest node as the survivor', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n3' }),
      new Rapid.OsmNode(context, { id: 'n-1' }),
      new Rapid.OsmNode(context, { id: 'n2' }),
      new Rapid.OsmNode(context, { id: 'n4' })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionConnect(['n3', 'n-1', 'n2', 'n4'])(graph);

    expect(result.hasEntity('n3')).toBeUndefined();
    expect(result.hasEntity('n-1')).toBeUndefined();
    expect(result.hasEntity('n2')).toBeTruthy();
    expect(result.hasEntity('n4')).toBeUndefined();
  });

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('chooses the oldest interesting node as the survivor', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n3' }),
      new Rapid.OsmNode(context, { id: 'n1' }),
      new Rapid.OsmNode(context, { id: 'n2', tags: { highway: 'traffic_signals' } }),
      new Rapid.OsmNode(context, { id: 'n4', tags: { crossing: 'marked' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionConnect(['n3', 'n1', 'n2', 'n4'])(graph);

    expect(result.hasEntity('n3')).toBeUndefined();
    expect(result.hasEntity('n1')).toBeUndefined();
    expect(result.hasEntity('n4')).toBeUndefined();

    const survivor = result.hasEntity('n2') as Rapid.OsmNode;
    expect(survivor).toBeInstanceOf(Rapid.OsmNode);
    expect(survivor.tags).toEqual({ highway: 'traffic_signals', crossing: 'marked' });
  });

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('chooses an existing node as the survivor', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n3' }),
      new Rapid.OsmNode(context, { id: 'n-1' }),
      new Rapid.OsmNode(context, { id: 'n-2', tags: { highway: 'traffic_signals' } }),
      new Rapid.OsmNode(context, { id: 'n-4', tags: { crossing: 'marked' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionConnect(['n3', 'n-1', 'n-2', 'n-4'])(graph);

    expect(result.hasEntity('n-1')).toBeUndefined();
    expect(result.hasEntity('n-2')).toBeUndefined();
    expect(result.hasEntity('n-4')).toBeUndefined();

    const survivor = result.hasEntity('n3') as Rapid.OsmNode;
    expect(survivor).toBeInstanceOf(Rapid.OsmNode);
    expect(survivor.tags).toEqual({ highway: 'traffic_signals', crossing: 'marked' });
  });
});
