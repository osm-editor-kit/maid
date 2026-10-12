// Adopted from iD test/spec/actions/split.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionSplit', () => {
  const context = new Rapid.MockContext();

  const pt = (id: string, x: number, y = 0) => new Rapid.OsmNode(context, { id, loc: [x, y] });
  const way = (id: string, nodes: string[], tags?: Record<string, string>) =>
    new Rapid.OsmWay(context, { id, nodes, tags });

  describe('disabled', () => {
    // needs F-actions-b-30
    it.todo('returns \'parent_incomplete\' when parent relations are too incomplete');

    it('allows split operation for single-member relations', () => {
      //
      // Situation:
      //    a ---> b ---> c         split at 'b'
      //    Relation: ['-']
      //
      // Expected result:
      //    any order is allowed, because the way is the only member of the relation
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 2),
        way('-', ['a', 'b', 'c']),
        new Rapid.OsmRelation(context, { id: 'r', members: [{ id: '-', type: 'way' }] })
      ]);
      const graph = new Rapid.Graph(base);
      expect(Rapid.actionSplit('b', ['=']).disabled(graph)).toBeFalsy();
    });

    // needs F-actions-b-31
    it.todo('returns \'simple_roundabout\' when a closed roundabout is part of a route relations');

    it('allows splitting of a closed roundabout that is part of a junction relation', () => {
      //
      // Situation:
      //    a ---> b ---> c ---> a      split at 'b'
      //    Relation: ['-'], '-' tagged as 'junction=roundabout'
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0, 0), pt('b', 1, 0), pt('c', 1, 1),
        way('-', ['a', 'b', 'c', 'a'], { junction: 'roundabout' }),
        new Rapid.OsmRelation(context, { id: 'r', members: [{ id: '-', type: 'way' }], tags: { type: 'junction' } })
      ]);
      const graph = new Rapid.Graph(base);
      expect(Rapid.actionSplit('a', ['*']).disabled(graph)).toBeFalsy();
    });
  });

  describe('ways', () => {
    it('gives the previous id to the longest way (first)', () => {
      //
      // Situation:
      //    a ---> b ---> c ---> d ---> e ---> f         split at 'd'
      //
      // Expected result:
      //    a ---> b ---> c ---> d ===> e ===> f
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4), pt('f', 5),
        way('-', ['a', 'b', 'c', 'd', 'e', 'f'])
      ]);
      const graph = Rapid.actionSplit('d', ['='])(new Rapid.Graph(base));
      expect(graph.entity('-').nodes).toEqual(['a', 'b', 'c', 'd']);
      expect(graph.entity('=').nodes).toEqual(['d', 'e', 'f']);
    });

    it('gives the previous id to the longest way (second)', () => {
      //
      // Situation:
      //    a ---> b ---> c ---> d ---> e ---> f         split at 'c'
      //
      // Expected result:
      //    a ===> b ===> c ---> d ---> e ---> f
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4), pt('f', 5),
        way('-', ['a', 'b', 'c', 'd', 'e', 'f'])
      ]);
      const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(base));
      expect(graph.entity('-').nodes).toEqual(['c', 'd', 'e', 'f']);
      expect(graph.entity('=').nodes).toEqual(['a', 'b', 'c']);
    });

    it('gives the previous id to the first way on same length', () => {
      //
      // Situation:
      //    a ---> b ---> c ---> d ---> e         split at 'c'
      //
      // Expected result:
      //    a ---> b ---> c ===> d ===> e
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4),
        way('-', ['a', 'b', 'c', 'd', 'e'])
      ]);
      const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(base));
      expect(graph.entity('-').nodes).toEqual(['a', 'b', 'c']);
      expect(graph.entity('=').nodes).toEqual(['c', 'd', 'e']);
    });

    it('gives the previous id to the longest way even with fewer nodes', () => {
      //
      // Situation:
      //    a -----------------> d ---> e ---> f         split at 'd'
      //
      // Expected result:
      //    a -----------------> d ===> e ===> f
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('d', 3), pt('e', 4), pt('f', 5),
        way('-', ['a', 'd', 'e', 'f'])
      ]);
      const graph = Rapid.actionSplit('d', ['='])(new Rapid.Graph(base));
      expect(graph.entity('-').nodes).toEqual(['a', 'd']);
      expect(graph.entity('=').nodes).toEqual(['d', 'e', 'f']);
    });

    // needs F-actions-b-32
    it.todo('splits a closed way at the given points');

    it('splits an open way at multiple given points', () => {
      //
      // Situation:
      //    a ---- b -- c -- d
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0, 0), pt('b', 0, 1), pt('c', 0, 1.5), pt('d', 0, 2),
        way('-', ['a', 'b', 'c', 'd'])
      ]);
      const g1 = Rapid.actionSplit(['b', 'c'], ['=', '≡'])(new Rapid.Graph(base));
      expect(g1.entity('-').nodes).toEqual(['a', 'b']); // original id remains on longest section
      expect(g1.entity('=').nodes).toEqual(['b', 'c']);
      expect(g1.entity('≡').nodes).toEqual(['c', 'd']);
    });

    it('splits an open way at multiple given points specified in any order', () => {
      //
      // Situation:
      //    a -- b -- c -- d -- e
      //
      // #12120
      const base = new Rapid.Graph(context, [
        pt('a', 0, 0), pt('b', 0, 1), pt('c', 0, 2), pt('d', 0, 3), pt('e', 0, 4),
        way('-', ['a', 'b', 'c', 'd', 'e'])
      ]);
      const g1 = Rapid.actionSplit(['c', 'b', 'd'], ['=', '≡', '≣'])(new Rapid.Graph(base));
      expect([
        g1.entity('-').nodes,
        g1.entity('=').nodes,
        g1.entity('≡').nodes,
        g1.entity('≣').nodes
      ].sort((x: string[], y: string[]) => (x[0] > y[0] ? 1 : -1))).toEqual([
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'e']
      ]);
    });

    it('distributes the number of steps proportionally', () => {
      const tags = { highway: 'steps', step_count: '40' };
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 4),
        way('-', ['a', 'b', 'c'], tags)
      ]);
      const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(base));
      // step count should be distributed according the the resulting ways'
      // segment lengths
      expect(graph.entity('=').tags.step_count).toEqual('10');
      expect(graph.entity('-').tags.step_count).toEqual('30');
    });

    it('preserves the total number of steps', () => {
      const tags = { highway: 'steps', step_count: '42' };
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 4),
        way('-', ['a', 'b', 'c'], tags)
      ]);
      const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(base));
      // the sum of the resulting step count should be preserved
      // even when the intermediate values are rounded
      expect(+graph.entity('=').tags.step_count + +graph.entity('-').tags.step_count).toEqual(42);
    });
  });

  describe('relations', () => {
    function members(graph: Rapid.Graph): string[] {
      return graph.entity('r').members.map((m: { id: string }) => m.id);
    }

    it('allows split action on partially incomplete relation, when member before split is present', () => {
      //
      // Situation:
      //    a ~~~> b ---> c ---> d        split at 'c'
      //    Relation: ['~', '-', '?']     member '?' missing
      //
      // Expected result:
      //    a ~~~> b ---> c ===> d
      //    Relation: ['~', '-', '=', '?']
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3),
        way('~', ['a', 'b']),
        way('-', ['b', 'c', 'd']),
        new Rapid.OsmRelation(context, {
          id: 'r',
          members: [{ id: '~', type: 'way' }, { id: '-', type: 'way' }, { id: '?', type: 'way' }]
        })
      ]);
      const action = Rapid.actionSplit('c', ['=']);
      const graph = new Rapid.Graph(base);
      expect(action.disabled(graph)).toBeFalsy();
      expect(members(action(graph))).toEqual(['~', '-', '=', '?']);
    });

    it('allows split action on partially incomplete relation, when member after split is present', () => {
      //
      // Situation:
      //    a ---> b ---> c ~~~> d        split at 'b'
      //    Relation: ['?', '-', '~']     member '?' missing
      //
      // Expected result:
      //    a ---> b ===> c ~~~> d
      //    Relation: ['?', '-', '=', '~']
      //
      const base = new Rapid.Graph(context, [
        pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3),
        way('-', ['a', 'b', 'c']),
        way('~', ['c', 'd']),
        new Rapid.OsmRelation(context, {
          id: 'r',
          members: [{ id: '?', type: 'way' }, { id: '-', type: 'way' }, { id: '~', type: 'way' }]
        })
      ]);
      const action = Rapid.actionSplit('b', ['=']);
      const graph = new Rapid.Graph(base);
      expect(action.disabled(graph)).toBeFalsy();
      expect(members(action(graph))).toEqual(['?', '-', '=', '~']);
    });

    describe('member ordering', () => {
      it('adds the new way to parent relations (existing way is first)', () => {
        //
        // Situation:
        //    a ---> b ---> c ---> d         split at 'c'
        //    Relation: ['-']
        //
        // Expected result:
        //    a ---> b ---> c ===> d
        //    Relation: ['-', '=']
        //
        const base = new Rapid.Graph(context, [
          pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3),
          way('-', ['a', 'b', 'c', 'd']),
          new Rapid.OsmRelation(context, { id: 'r', members: [{ id: '-', type: 'way', role: 'forward' }] })
        ]);
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(base));
        expect(graph.entity('r').members).toEqual([
          { id: '-', type: 'way', role: 'forward' },
          { id: '=', type: 'way', role: 'forward' }
        ]);
      });

      // F-actions-b-36: the new way goes in front of the existing way when the existing way is the second part.
      // Maid: differs from Rapid here (F-actions-b-36, see docs/research/relations-vs-id.md)
      it('adds the new way to parent relations (existing way is second)', () => {
        const base = new Rapid.Graph(context, [
          pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3),
          way('-', ['a', 'b', 'c', 'd']),
          new Rapid.OsmRelation(context, { id: 'r', members: [{ id: '-', type: 'way', role: 'forward' }] })
        ]);
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(base));
        expect(graph.entity('r').members).toEqual([
          { id: '=', type: 'way', role: 'forward' },
          { id: '-', type: 'way', role: 'forward' }
        ]);
      });
    });

    describe('splitting out-and-back routes', () => {
      // Shared nodes of iD's block: a (0,0), b (0,1), c (0,2), d (0,3), e (0,4).
      const outAndBackRelation = () => new Rapid.OsmRelation(context, {
        id: 'r',
        members: [
          { id: '-', type: 'way' },
          { id: '~', type: 'way' },
          { id: '~', type: 'way' },
          { id: '-', type: 'way' }
        ]
      });
      const outNodes = () => [pt('a', 0, 0), pt('b', 0, 1), pt('c', 0, 2), pt('d', 0, 3), pt('e', 0, 4)];

      //
      // Situation:
      //    a ---> b ---> c ---> d ~~~> e
      //    Relation: ['-', '~', '~', '-']
      //
      const outAndBack1 = () => new Rapid.Graph(context, [
        ...outNodes(),
        way('-', ['a', 'b', 'c', 'd']),
        way('~', ['d', 'e']),
        outAndBackRelation()
      ]);
      //
      // Situation:
      //    a <--- b <--- c <--- d ~~~> e
      //    Relation: ['-', '~', '~', '-']
      //
      const outAndBack2 = () => new Rapid.Graph(context, [
        ...outNodes(),
        way('-', ['d', 'c', 'b', 'a']),
        way('~', ['d', 'e']),
        outAndBackRelation()
      ]);
      //
      // Situation:
      //    a ---> b ---> c ---> d <~~~ e
      //    Relation: ['-', '~', '~', '-']
      //
      const outAndBack3 = () => new Rapid.Graph(context, [
        ...outNodes(),
        way('-', ['a', 'b', 'c', 'd']),
        way('~', ['e', 'd']),
        outAndBackRelation()
      ]);
      //
      // Situation:
      //    a <--- b <--- c <--- d <~~~ e
      //    Relation: ['-', '~', '~', '-']
      //
      const outAndBack4 = () => new Rapid.Graph(context, [
        ...outNodes(),
        way('-', ['d', 'c', 'b', 'a']),
        way('~', ['e', 'd']),
        outAndBackRelation()
      ]);

      it('splits out-and-back1 route at c', () => {
        //
        // Expected result:
        //    a ---> b ---> c ===> d ~~~> e
        //    Relation: ['-', '=', '~', '~', '=', '-']
        //
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(outAndBack1()));
        expect(graph.entity('-').nodes).toEqual(['a', 'b', 'c']);
        expect(graph.entity('=').nodes).toEqual(['c', 'd']);
        expect(graph.entity('~').nodes).toEqual(['d', 'e']);
        expect(members(graph)).toEqual(['-', '=', '~', '~', '=', '-']);
      });

      // Maid: differs from Rapid here (F-actions-b-36, see docs/research/relations-vs-id.md)
      it('splits out-and-back2 route at c', () => {
        //    a <--- b <--- c <=== d ~~~> e
        //    Relation: ['-', '=', '~', '~', '=', '-']
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(outAndBack2()));
        expect(graph.entity('-').nodes).toEqual(['c', 'b', 'a']);
        expect(graph.entity('=').nodes).toEqual(['d', 'c']);
        expect(graph.entity('~').nodes).toEqual(['d', 'e']);
        expect(members(graph)).toEqual(['-', '=', '~', '~', '=', '-']);
      });

      it('splits out-and-back3 route at c', () => {
        //    a ---> b ---> c ===> d <~~~ e
        //    Relation: ['-', '=', '~', '~', '=', '-']
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(outAndBack3()));
        expect(graph.entity('-').nodes).toEqual(['a', 'b', 'c']);
        expect(graph.entity('=').nodes).toEqual(['c', 'd']);
        expect(graph.entity('~').nodes).toEqual(['e', 'd']);
        expect(members(graph)).toEqual(['-', '=', '~', '~', '=', '-']);
      });

      // Maid: differs from Rapid here (F-actions-b-36, see docs/research/relations-vs-id.md)
      it('splits out-and-back4 route at c', () => {
        //    a <--- b <--- c <=== d <~~~ e
        //    Relation: ['-', '=', '~', '~', '=', '-']
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(outAndBack4()));
        expect(graph.entity('-').nodes).toEqual(['c', 'b', 'a']);
        expect(graph.entity('=').nodes).toEqual(['d', 'c']);
        expect(graph.entity('~').nodes).toEqual(['e', 'd']);
        expect(members(graph)).toEqual(['-', '=', '~', '~', '=', '-']);
      });
    });

    describe('splitting Y routes', () => {
      const a = pt('a', 0, 0);
      const b = pt('b', 1, 0);
      const c = pt('c', 2, 0);
      const d = pt('d', 2, -1);
      const e = pt('e', 3, -1);

      it('splits excursion part of a forking route', () => {
        //
        // Situation:
        //    a ---> b ~~~> c
        //           #
        //           #####> d ###> e
        //
        //    Relation: ['-', '~', '#']
        //
        // Expected result:
        //    a ---> b ~~~> c
        //           #
        //           #####> d ***> e
        //
        //    Relation: ['-', '~', '#', '*']
        //
        const base = new Rapid.Graph(context, [
          a, b, c, d, e,
          way('-', ['a', 'b']),
          way('~', ['b', 'c']),
          way('#', ['b', 'd', 'e']),
          new Rapid.OsmRelation(context, {
            id: 'r',
            members: [
              { id: '-', type: 'way', role: 'main' },
              { id: '~', type: 'way', role: 'main' },
              { id: '#', type: 'way', role: 'excursion' }
            ]
          })
        ]);
        const graph = Rapid.actionSplit('d', ['*'])(new Rapid.Graph(base));
        expect(graph.entity('*').nodes).toEqual(['d', 'e']);
        expect(members(graph)).toEqual(['-', '~', '#', '*']);
        expect(graph.entity('r').members.find((m: { id: string }) => m.id === '*').role).toEqual('excursion');
      });

      it('splits main part of forking route', () => {
        //
        // Situation:
        //    a ---> b ###> c
        //           ~
        //           ~~~~~> d ~~~> e
        //
        //    Relation: ['-', '~', '#']
        //
        // Expected result:
        //    a ---> b ###> c
        //           ~
        //           ~~~~~> d ***> e
        //
        //    Relation: ['-', '~', '*', '#']
        //
        const base = new Rapid.Graph(context, [
          a, b, c, d, e,
          way('-', ['a', 'b']),
          way('~', ['b', 'd', 'e']),
          way('#', ['b', 'c']),
          new Rapid.OsmRelation(context, {
            id: 'r',
            members: [
              { id: '-', type: 'way', role: 'main' },
              { id: '~', type: 'way', role: 'main' },
              { id: '#', type: 'way', role: 'excursion' }
            ]
          })
        ]);
        const graph = Rapid.actionSplit('d', ['*'])(new Rapid.Graph(base));
        expect(graph.entity('*').nodes).toEqual(['d', 'e']);
        expect(members(graph)).toEqual(['-', '~', '*', '#']);
        expect(graph.entity('r').members.find((m: { id: string }) => m.id === '*').role).toEqual('main');
      });
    });

    describe('splitting dual carriageway routes', () => {
      const a = pt('a', 0, 0);
      const b = pt('b', 1, 0);
      const c = pt('c', 2, 0);
      const d = pt('d', 3, 0);
      const e = pt('e', 1.5, -1);

      // needs F-actions-b-36: still open. The pair order comes from the join's direction through the two
      // parallel ways, not from the neighbours as in iD's splitWayMember, so both come out in the wrong order.
      it.todo('splits dual-carriageway route, preserving role (forward way)');

      // needs F-actions-b-36: still open, same cause as the forward way test above.
      it.todo('splits dual-carriageway route, preserving role (backward way)');
    });
  });

  describe('type = multipolygon', () => {
    it('transfers relation memberships of an area to the resulting multipolygon', () => {
      // Situation: a ---- b
      //            |      |
      //            d ---- c
      // Split at a. The way was also a member of a site relation. #12024
      const base = new Rapid.Graph(context, [
        pt('a', 0, 1), pt('b', 1, 1), pt('c', 1, 0), pt('d', 0, 0),
        way('-', ['a', 'b', 'c', 'd', 'a'], { area: 'yes' }),
        new Rapid.OsmRelation(context, {
          id: 's',
          members: [{ id: '-', role: 'main', type: 'way' }],
          tags: { type: 'site' }
        })
      ]);
      const graph = Rapid.actionSplit('a', ['='])(new Rapid.Graph(base));

      const parents = graph.parentRelations(graph.entity('-'));
      expect(parents).toHaveLength(1);
      expect(graph.entity('s').members.length).toEqual(1);
      expect(graph.entity('s').members[0]).toEqual({ id: parents[0].id, role: 'main', type: 'relation' });
    });

    // needs F-actions-b-33
    it.todo('preserves coastline tag on the ways when creating a multipolygon');
  });

  // Shared nodes of iD's block: a (0,0) to f (5,0) along one line.
  const line = [pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4), pt('f', 5)];

  // iD's fixtures for the four restriction types, 'destination_sign' included.
  ['restriction', 'restriction:bus', 'manoeuvre', 'destination_sign'].forEach((type) => {
    const viaRole = type === 'destination_sign' ? 'intersection' : 'via';
    const isDestinationSign = type === 'destination_sign';

    type Member = { id: string; role: string; type: 'way' | 'node' };
    const restrictionOf = (ways: Rapid.OsmWay[], members: Member[]) =>
      new Rapid.Graph(context, [
        ...line,
        ...ways,
        new Rapid.OsmRelation(context, { id: 'r', tags: { type }, members: members as never })
      ]);

    // Situation: a ----> b ----> c ----> d ~~~~ e, a restriction from ---- to ~~~~ via node d.
    const restriction1 = () => restrictionOf(
      [way('-', ['a', 'b', 'c', 'd']), way('~', ['d', 'e'])],
      [{ id: '-', role: 'from', type: 'way' }, { id: '~', role: 'to', type: 'way' }, { id: 'd', role: viaRole, type: 'node' }]
    );
    // Situation: the same ways, a restriction from ~~~~ to ---- via node d.
    const restriction2 = () => restrictionOf(
      [way('-', ['a', 'b', 'c', 'd']), way('~', ['d', 'e'])],
      [{ id: '~', role: 'from', type: 'way' }, { id: '-', role: 'to', type: 'way' }, { id: 'd', role: viaRole, type: 'node' }]
    );
    // Situation: the same ways, a u-turn restriction from ---- to ---- via node d.
    const restriction3 = () => restrictionOf(
      [way('-', ['a', 'b', 'c', 'd']), way('~', ['d', 'e'])],
      [{ id: '-', role: 'from', type: 'way' }, { id: '-', role: 'to', type: 'way' }, { id: 'd', role: viaRole, type: 'node' }]
    );
    // Situation: d ~~~~ e, then f <~~~~ e and | from e down to d, a restriction from ---- to ~~~~ via way |.
    const restriction4 = () => restrictionOf(
      [way('-', ['a', 'b', 'c', 'd']), way('|', ['d', 'e']), way('~', ['e', 'f'])],
      [{ id: '-', role: 'from', type: 'way' }, { id: '~', role: 'to', type: 'way' }, { id: '|', role: viaRole, type: 'way' }]
    );
    // Situation: as restriction4, a restriction from ~~~~ to ---- via way |.
    const restriction5 = () => restrictionOf(
      [way('-', ['a', 'b', 'c', 'd']), way('|', ['d', 'e']), way('~', ['e', 'f'])],
      [{ id: '~', role: 'from', type: 'way' }, { id: '-', role: 'to', type: 'way' }, { id: '|', role: viaRole, type: 'way' }]
    );
    // Situation: e above a, f above d, a restriction from | to ‖ via way ----.
    const restriction6 = () => restrictionOf(
      [way('-', ['a', 'b', 'c', 'd']), way('|', ['e', 'a']), way('‖', ['f', 'd'])],
      [{ id: '|', role: 'from', type: 'way' }, { id: '-', role: viaRole, type: 'way' }, { id: '‖', role: 'to', type: 'way' }]
    );
    // Situation: a <---- b <---- c <---- d ~~~~ e, a restriction from ---- to ~~~~ via node d.
    const restriction7 = () => restrictionOf(
      [way('-', ['d', 'c', 'b', 'a']), way('~', ['d', 'e'])],
      [{ id: '-', role: 'from', type: 'way' }, { id: '~', role: 'to', type: 'way' }, { id: 'd', role: viaRole, type: 'node' }]
    );

    // The 'b' titles are covered by Rapid's tests for the other three types.
    // Only destination_sign needs these: F-actions-b-35, the 'intersection' role counts as via (iD's tests, same data).
    if (isDestinationSign) {
      it('updates a restriction\'s \'from\' role - via node (1b)', () => {
        // Expected result:
        //    a ====> b ----> c ----> d ~~~~ e
        // A restriction from ---- to ~~~~ via node d.
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(restriction1()));
        expect(graph.entity('r').members).toEqual([
          { id: '-', role: 'from', type: 'way' },
          { id: '~', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });

      it('updates a restriction\'s \'to\' role - via node (2b)', () => {
        // Expected result:
        //    a ====> b ----> c ----> d ~~~~ e
        // A restriction from ~~~~ to ---- via node d.
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(restriction2()));
        expect(graph.entity('r').members).toEqual([
          { id: '~', role: 'from', type: 'way' },
          { id: '-', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });

      it('updates both \'to\' and \'from\' roles for via-node u-turn restrictions (3b)', () => {
        // Expected result:
        //    a ====> b ----> c ----> d ~~~~ e
        // A restriction from ---- to ---- via node d.
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(restriction3()));
        expect(graph.entity('r').members).toEqual([
          { id: '-', role: 'from', type: 'way' },
          { id: '-', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });

      it('updates a restriction\'s \'from\' role - via way (4b)', () => {
        // Expected result:
        //                    f <~~~~ e
        //                            |
        //                            |
        //    a ====> b ----> c ----> d
        // A restriction from ---- to ~~~~ via way |
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(restriction4()));
        expect(graph.entity('r').members).toEqual([
          { id: '-', role: 'from', type: 'way' },
          { id: '~', role: 'to', type: 'way' },
          { id: '|', role: viaRole, type: 'way' }
        ]);
      });

      it('updates a restriction\'s \'to\' role - via way (5b)', () => {
        // Expected result:
        //                    f <~~~~ e
        //                            |
        //                            |
        //    a ====> b ----> c ----> d
        // A restriction from ~~~~ to ---- via way |
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(restriction5()));
        expect(graph.entity('r').members).toEqual([
          { id: '~', role: 'from', type: 'way' },
          { id: '-', role: 'to', type: 'way' },
          { id: '|', role: viaRole, type: 'way' }
        ]);
      });

      it('updates a restriction\'s \'via\' role when splitting via way (6b)', () => {
        // Expected result:
        //    e                       f
        //    |                       ‖
        //    |                       ‖
        //    a ====> b ----> c ----> d
        // A restriction from | to ‖ via ways ----, ====
        // (iD's test splits at 'c', as its 6c; the expected result is the same.)
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction6()));
        expect(graph.entity('r').members).toEqual([
          { id: '|', role: 'from', type: 'way' },
          { id: '-', role: viaRole, type: 'way' },
          { id: '=', role: viaRole, type: 'way' },
          { id: '‖', role: 'to', type: 'way' }
        ]);
      });

      it('leaves unaffected restrictions unchanged (7b)', () => {
        // Expected result:
        //    a <==== b <---- c <---- d ~~~~ e
        // A restriction from ---- to ~~~~ via d.
        const graph = Rapid.actionSplit('b', ['='])(new Rapid.Graph(restriction7()));
        expect(graph.entity('r').members).toEqual([
          { id: '-', role: 'from', type: 'way' },
          { id: '~', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });
    }

    describe(`type = ${type}`, () => {
      it('updates a restriction\'s \'from\' role - via node (1c)', () => {
        // Expected result:
        //    a ----> b ----> c ====> d ~~~~ e
        // A restriction from ==== to ~~~~ via node d.
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction1()));
        expect(graph.entity('r').members).toEqual([
          { id: '=', role: 'from', type: 'way' },
          { id: '~', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });

      it('updates a restriction\'s \'to\' role - via node (2c)', () => {
        // Expected result:
        //    a ----> b ----> c ====> d ~~~~ e
        // A restriction from ~~~~ to ==== via node d.
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction2()));
        expect(graph.entity('r').members).toEqual([
          { id: '~', role: 'from', type: 'way' },
          { id: '=', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });

      it('updates both \'to\' and \'from\' roles for via-node u-turn restrictions (3c)', () => {
        // Expected result:
        //    a ----> b ----> c ====> d ~~~~ e
        // A restriction from ==== to ==== via node d.
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction3()));
        expect(graph.entity('r').members).toEqual([
          { id: '=', role: 'from', type: 'way' },
          { id: '=', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });

      it('updates a restriction\'s \'from\' role - via way (4c)', () => {
        // Expected result:
        // A restriction from ==== to ~~~~ via way |
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction4()));
        expect(graph.entity('r').members).toEqual([
          { id: '=', role: 'from', type: 'way' },
          { id: '~', role: 'to', type: 'way' },
          { id: '|', role: viaRole, type: 'way' }
        ]);
      });

      it('updates a restriction\'s \'to\' role - via way (5c)', () => {
        // Expected result:
        // A restriction from ~~~~ to ==== via way |
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction5()));
        expect(graph.entity('r').members).toEqual([
          { id: '~', role: 'from', type: 'way' },
          { id: '=', role: 'to', type: 'way' },
          { id: '|', role: viaRole, type: 'way' }
        ]);
      });

      it('updates a restriction\'s \'via\' role when splitting via way (6c)', () => {
        // Expected result:
        //    e                       f
        //    |                       ‖
        //    |                       ‖
        //    a ----> b ----> c ====> d
        // A restriction from | to ‖ via ways ----, ====
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction6()));
        expect(graph.entity('r').members).toEqual([
          { id: '|', role: 'from', type: 'way' },
          { id: '-', role: viaRole, type: 'way' },
          { id: '=', role: viaRole, type: 'way' },
          { id: '‖', role: 'to', type: 'way' }
        ]);
      });

      it('leaves unaffected restrictions unchanged (7c)', () => {
        // Expected result:
        //    a <---- b <---- c <==== d ~~~~ e
        // A restriction from ---- to ~~~~ via d.
        const graph = Rapid.actionSplit('c', ['='])(new Rapid.Graph(restriction7()));
        expect(graph.entity('r').members).toEqual([
          { id: '=', role: 'from', type: 'way' },
          { id: '~', role: 'to', type: 'way' },
          { id: 'd', role: viaRole, type: 'node' }
        ]);
      });
    });
  });
});
