// Adopted from iD test/spec/geo/geom.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import * as sdk from '../../sdk.ts'

// iD's geoAngle takes entities with a loc and a projection; Maid's vecAngle takes the two points.
function geoAngle(a: { loc: [number, number] }, b: { loc: [number, number] }, projection: (p: [number, number]) => [number, number]) {
    return sdk.vecAngle(projection(a.loc), projection(b.loc))
}

describe('iD.geo - geometry', () => {
    describe('geoAngle', function() {
        it('returns angle between a and b', function() {
            var projection = function (_) { return _; };
            expect(geoAngle({loc:[0, 0]}, {loc:[1, 0]}, projection)).toBeCloseTo(0, 6);
            expect(geoAngle({loc:[0, 0]}, {loc:[0, 1]}, projection)).toBeCloseTo(Math.PI / 2, 6);
            expect(geoAngle({loc:[0, 0]}, {loc:[-1, 0]}, projection)).toBeCloseTo(Math.PI, 6);
            expect(geoAngle({loc:[0, 0]}, {loc:[0, -1]}, projection)).toBeCloseTo(-Math.PI / 2, 6);
        });
    });

    describe('geoEdgeEqual', function() {
        it('returns false for inequal edges', function() {
            expect(sdk.geomEdgeEqual(['a', 'b'], ['a', 'c'])).toBe(false);
        });

        it('returns true for equal edges along same direction', function() {
            expect(sdk.geomEdgeEqual(['a', 'b'], ['a', 'b'])).toBe(true);
        });

        it('returns true for equal edges along opposite direction', function() {
            expect(sdk.geomEdgeEqual(['a', 'b'], ['b', 'a'])).toBe(true);
        });
    });

    describe('geoRotate', function() {
        it('rotates points around [0, 0]', function() {
            var points = [[5, 0], [5, 1]];
            var angle = Math.PI;
            var around = [0, 0];
            var result = sdk.geomRotate(points, angle, around);
            expect(result[0][0]).toBeCloseTo(-5, 6);
            expect(result[0][1]).toBeCloseTo(0, 6);
            expect(result[1][0]).toBeCloseTo(-5, 6);
            expect(result[1][1]).toBeCloseTo(-1, 6);
        });

        it('rotates points around [3, 0]', function() {
            var points = [[5, 0], [5, 1]];
            var angle = Math.PI;
            var around = [3, 0];
            var result = sdk.geomRotate(points, angle, around);
            expect(result[0][0]).toBeCloseTo(1, 6);
            expect(result[0][1]).toBeCloseTo(0, 6);
            expect(result[1][0]).toBeCloseTo(1, 6);
            expect(result[1][1]).toBeCloseTo(-1, 6);
        });
    });

    describe('geoChooseEdge', () => {
        // needs F-geo-1
        it.todo('returns null for a degenerate way (no nodes)')
        it.todo('returns null for a degenerate way (single node)')
        it.todo('calculates the orthogonal projection of a point onto a segment')
        it.todo('returns the starting vertex when the orthogonal projection is < 0')
        it.todo('returns the ending vertex when the orthogonal projection is > 1')
        it.todo('skips the given nodeID at end of way')
        it.todo('skips the given nodeID in middle of way')
        it.todo('returns null if all nodes are skipped')
    })

    describe('geoHasLineIntersections', () => {
        // needs F-geo-2
        it.todo('returns false for a degenerate way (no nodes)')
        it.todo('returns false if no activeID')
        it.todo('returns false if there are no intersections')
        it.todo('returns true if the activeID is causing intersections')
    })

    // geoHasSelfIntersections: covered by packages/model/test/geo/geom.test.js (same titles, Rapid's port)

    describe('geoLineIntersection', function() {
        it('returns null if lines are colinear with overlap', function() {
            var a = [[0, 0], [10, 0]];
            var b = [[-5, 0], [5, 0]];
            expect(sdk.geomLineIntersection(a, b)).toBeNull();
        });
        it('returns null if lines are colinear but disjoint', function() {
            var a = [[5, 0], [10, 0]];
            var b = [[-10, 0], [-5, 0]];
            expect(sdk.geomLineIntersection(a, b)).toBeNull();
        });
        it('returns null if lines are parallel', function() {
            var a = [[0, 0], [10, 0]];
            var b = [[0, 5], [10, 5]];
            expect(sdk.geomLineIntersection(a, b)).toBeNull();
        });
        it('returns the intersection point between 2 lines', function() {
            var a = [[0, 0], [10, 0]];
            var b = [[5, 10], [5, -10]];
            expect(sdk.geomLineIntersection(a, b)).toEqual([5, 0]);
        });
        it('returns null if lines are not parallel but not intersecting', function() {
            var a = [[0, 0], [10, 0]];
            var b = [[-5, 10], [-5, -10]];
            expect(sdk.geomLineIntersection(a, b)).toBeNull();
        });
    });

    describe('geoPointInPolygon', function() {
        it('says a point in a polygon is on a polygon', function() {
            var poly = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
            var point = [0.5, 0.5];
            expect(sdk.geomPointInPolygon(point, poly)).toBe(true);
        });
        it('says a point outside of a polygon is outside', function() {
            var poly = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
            var point = [0.5, 1.5];
            expect(sdk.geomPointInPolygon(point, poly)).toBe(false);
        });
    });

    describe('geoPolygonContainsPolygon', function() {
        it('says a polygon in a polygon is in', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
            expect(sdk.geomPolygonContainsPolygon(outer, inner)).toBe(true);
        });
        it('says a polygon outside of a polygon is out', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[1, 1], [1, 9], [2, 2], [2, 1], [1, 1]];
            expect(sdk.geomPolygonContainsPolygon(outer, inner)).toBe(false);
        });
    });

    describe('geoPolygonIntersectsPolygon', function() {
        it('returns true when outer polygon fully contains inner', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
            expect(sdk.geomPolygonIntersectsPolygon(outer, inner)).toBe(true);
        });

        it('returns false when inner polygon fully contains outer', function() {
            var inner = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var outer = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
            expect(sdk.geomPolygonIntersectsPolygon(outer, inner)).toBe(false);
        });

        it('returns true when outer polygon partially contains inner (some vertices contained)', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[-1, -1], [1, 2], [2, 2], [2, 1], [1, 1]];
            expect(sdk.geomPolygonIntersectsPolygon(outer, inner)).toBe(true);
        });

        it('returns false when outer polygon partially contains inner (no vertices contained - lax test)', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[1, -1], [1, 4], [2, 4], [2, -1], [1, -1]];
            expect(sdk.geomPolygonIntersectsPolygon(outer, inner)).toBe(false);
        });

        it('returns true when outer polygon partially contains inner (no vertices contained - strict test)', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[1, -1], [1, 4], [2, 4], [2, -1], [1, -1]];
            expect(sdk.geomPolygonIntersectsPolygon(outer, inner, true)).toBe(true);
        });

        it('returns false when outer and inner are fully disjoint', function() {
            var outer = [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]];
            var inner = [[-1, -1], [-1, -2], [-2, -2], [-2, -1], [-1, -1]];
            expect(sdk.geomPolygonIntersectsPolygon(outer, inner)).toBe(false);
        });
    });

    describe('geoGetSmallestSurroundingRectangle', function() {
        // needs F-geo-5: Maid's polygon winds the other way round (and is called polygon, not poly)
        it.todo('calculates a smallest surrounding rectangle');

    });

    describe('geoPathLength', function() {
        it('calculates a simple path length', function() {
            var path = [[0, 0], [0, 1], [3, 5]];
            expect(sdk.geomPathLength(path)).toEqual(6);
        });

        it('does not fail on single-point path', function() {
            var path = [[0, 0]];
            expect(sdk.geomPathLength(path)).toEqual(0);
        });

        it('estimates zero-length edges', function() {
            var path = [[0, 0], [0, 0]];
            expect(sdk.geomPathLength(path)).toEqual(0);
        });
    });

    describe('geoViewportEdge', () => {
        // needs F-geo-3
        it.todo('returns null if the point is not at the edge')
        it.todo('nudges top edge')
        it.todo('nudges top-right corner')
        it.todo('nudges right edge')
        it.todo('nudges bottom-right corner')
        it.todo('nudges bottom edge')
        it.todo('nudges bottom-left corner')
        it.todo('nudges left edge')
        it.todo('nudges top-left corner')
    })
})
