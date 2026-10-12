// Adopted from iD test/spec/geo/extent.js (ISC, © iD contributors), at commit 0194f3926.
// iD's extent methods also take a point or a [min, max] pair; Maid's take an Extent, so the arguments go through geoExtent.
// iD's extent is an array [min, max]; Maid's `Extent` (@rapid-sdk/math) has `min` and `max`. The helper
// below takes iD's forms (no argument, a point, two points, a [min, max] pair, an extent) and returns an Extent.
import { describe, expect, it } from 'bun:test'
import { Extent, type Vec2 } from '../../sdk.ts'

type Pair = [Vec2, Vec2]

function geoExtent(a?: Extent | Vec2 | Pair, b?: Vec2): Extent {
  if (Array.isArray(a) && Array.isArray(a[0])) return new Extent(a[0] as Vec2, a[1] as Vec2)
  return new Extent(a as Extent | Vec2 | undefined, b)
}


describe('geoExtent', function () {
    describe('constructor', function () {
        it('defaults to infinitely empty extent', function () {
            expect(geoExtent().equals(geoExtent([[Infinity, Infinity], [-Infinity, -Infinity]]))).toBeTruthy();
        });

        it('constructs via a point', function () {
            var p = [0, 0];
            expect(geoExtent(p).equals(geoExtent([p, p]))).toBeTruthy();
        });

        it('constructs via two points', function () {
            var min = [0, 0],
                max = [5, 10];
            expect(geoExtent(min, max).equals(geoExtent([min, max]))).toBeTruthy();
        });

        it('constructs via an extent', function () {
            var min = [0, 0],
                max = [5, 10];
            expect(geoExtent([min, max]).equals(geoExtent([min, max]))).toBeTruthy();
        });

        it('constructs via an geoExtent', function () {
            var min = [0, 0],
                max = [5, 10],
                extent = geoExtent(min, max);
            expect(geoExtent(extent).equals(geoExtent(extent))).toBeTruthy();
        });

        it('has min element', function () {
            var min = [0, 0],
                max = [5, 10];
            expect(geoExtent(min, max).min).toEqual(min);
        });

        it('has max element', function () {
            var min = [0, 0],
                max = [5, 10];
            expect(geoExtent(min, max).max).toEqual(max);
        });
    });

    describe('#equals', function () {
        it('tests extent equality', function () {
            var e1 = geoExtent([0, 0], [10, 10]),
                e2 = geoExtent([0, 0], [10, 10]),
                e3 = geoExtent([0, 0], [12, 12]);
            expect(e1.equals(geoExtent(e2))).toBeTruthy();
            expect(e1.equals(geoExtent(e3))).toBeFalsy();
        });
    });

    describe('#center', function () {
        it('returns the center point', function () {
            expect(geoExtent([0, 0], [5, 10]).center()).toEqual([2.5, 5]);
        });
    });

    describe('#rectangle', function () {
        it('returns the extent as a rectangle', function () {
            expect(geoExtent([0, 0], [5, 10]).rectangle()).toEqual([0, 0, 5, 10]);
        });
    });

    describe('#polygon', function () {
        // needs F-geo-5: Maid's polygon() winds the other way round
        it.todo('returns the extent as a polygon');
    });

    describe('#area', function () {
        it('returns the area', function () {
           expect(geoExtent([0, 0], [5, 10]).area()).toEqual(50);
        });
    });

    describe('#padByMeters', function () {
        it('does not change centerpoint of an extent', function () {
           var min = [0, 0], max = [5, 10];
           expect(geoExtent(min, max).padByMeters(100).center()).toEqual([2.5, 5]);
        });

        it('does not affect the extent with a pad of zero', function () {
           var min = [0, 0], max = [5, 10];
           expect(geoExtent(min, max).padByMeters(0).min).toEqual([0, 0]);
        });
    });

    describe('#extend', function () {
        it('does not modify self', function () {
            var extent = geoExtent([0, 0], [0, 0]);
            extent.extend(geoExtent([1, 1]));
            expect(extent.equals(geoExtent([[0, 0], [0, 0]]))).toBeTruthy();
        });

        it('returns the minimal extent containing self and the given point', function () {
            expect(geoExtent().extend(geoExtent([0, 0])).equals(geoExtent([[0, 0], [0, 0]]))).toBeTruthy();
            expect(geoExtent([0, 0], [0, 0]).extend(geoExtent([5, 10])).equals(geoExtent([[0, 0], [5, 10]]))).toBeTruthy();
        });

        it('returns the minimal extent containing self and the given extent', function () {
            expect(geoExtent().extend(geoExtent([[0, 0], [5, 10]])).equals(geoExtent([[0, 0], [5, 10]]))).toBeTruthy();
            expect(geoExtent([0, 0], [0, 0]).extend(geoExtent([[4, -1], [5, 10]])).equals(geoExtent([[0, -1], [5, 10]]))).toBeTruthy();
        });
    });

    describe('#_extend', function () {
        it('extends self to the minimal extent containing self and the given extent', function () {
            var e = geoExtent();
            e.extendSelf(geoExtent([[0, 0], [5, 10]]));
            expect(e.equals(geoExtent([[0, 0], [5, 10]]))).toBeTruthy();

            e = geoExtent([0, 0], [0, 0]);
            e.extendSelf(geoExtent([[4, -1], [5, 10]]));
            expect(e.equals(geoExtent([[0, -1], [5, 10]]))).toBeTruthy();
        });
    });

    describe('#contains', function () {
        it('returns true for a point inside self', function () {
            expect(geoExtent([0, 0], [5, 5]).contains(geoExtent([2, 2]))).toBe(true);
        });

        it('returns true for a point on the boundary of self', function () {
            expect(geoExtent([0, 0], [5, 5]).contains(geoExtent([0, 0]))).toBe(true);
        });

        it('returns false for a point outside self', function () {
            expect(geoExtent([0, 0], [5, 5]).contains(geoExtent([6, 6]))).toBe(false);
        });

        it('returns true for an extent contained by self', function () {
            expect(geoExtent([0, 0], [5, 5]).contains(geoExtent([[1, 1], [2, 2]]))).toBe(true);
            expect(geoExtent([1, 1], [2, 2]).contains(geoExtent([[0, 0], [5, 5]]))).toBe(false);
        });

        it('returns false for an extent partially contained by self', function () {
            expect(geoExtent([0, 0], [5, 5]).contains(geoExtent([[1, 1], [6, 6]]))).toBe(false);
            expect(geoExtent([1, 1], [6, 6]).contains(geoExtent([[0, 0], [5, 5]]))).toBe(false);
        });

        it('returns false for an extent not intersected by self', function () {
            expect(geoExtent([0, 0], [5, 5]).contains(geoExtent([[6, 6], [7, 7]]))).toBe(false);
            expect(geoExtent([[6, 6], [7, 7]]).contains(geoExtent([[0, 0], [5, 5]]))).toBe(false);
        });
    });

    describe('#intersects', function () {
        it('returns true for a point inside self', function () {
            expect(geoExtent([0, 0], [5, 5]).intersects(geoExtent([2, 2]))).toBe(true);
        });

        it('returns true for a point on the boundary of self', function () {
            expect(geoExtent([0, 0], [5, 5]).intersects(geoExtent([0, 0]))).toBe(true);
        });

        it('returns false for a point outside self', function () {
            expect(geoExtent([0, 0], [5, 5]).intersects(geoExtent([6, 6]))).toBe(false);
        });

        it('returns true for an extent contained by self', function () {
            expect(geoExtent([0, 0], [5, 5]).intersects(geoExtent([[1, 1], [2, 2]]))).toBe(true);
            expect(geoExtent([1, 1], [2, 2]).intersects(geoExtent([[0, 0], [5, 5]]))).toBe(true);
        });

        it('returns true for an extent partially contained by self', function () {
            expect(geoExtent([0, 0], [5, 5]).intersects(geoExtent([[1, 1], [6, 6]]))).toBe(true);
            expect(geoExtent([1, 1], [6, 6]).intersects(geoExtent([[0, 0], [5, 5]]))).toBe(true);
        });

        it('returns false for an extent not intersected by self', function () {
            expect(geoExtent([0, 0], [5, 5]).intersects(geoExtent([[6, 6], [7, 7]]))).toBe(false);
            expect(geoExtent([[6, 6], [7, 7]]).intersects(geoExtent([[0, 0], [5, 5]]))).toBe(false);
        });
    });

    describe('#intersection', function () {
        it('returns an empty extent if self does not intersect with other', function () {
            var a = geoExtent([0, 0], [5, 5]),
                b = geoExtent([6, 6], [7, 7]);
            expect(a.intersection(geoExtent(b))).toEqual(geoExtent());
        });

        it('returns the intersection of self with other (1)', function () {
            var a = geoExtent([0, 0], [5, 5]),
                b = geoExtent([3, 4], [7, 7]);
            expect(a.intersection(geoExtent(b))).toEqual(geoExtent([3, 4], [5, 5]));
            expect(b.intersection(geoExtent(a))).toEqual(geoExtent([3, 4], [5, 5]));
        });

        it('returns the intersection of self with other (2)', function () {
            var a = geoExtent([0, 0], [5, 5]),
                b = geoExtent([3, -4], [7, 2]);
            expect(a.intersection(geoExtent(b))).toEqual(geoExtent([3, 0], [5, 2]));
            expect(b.intersection(geoExtent(a))).toEqual(geoExtent([3, 0], [5, 2]));
        });

        it('returns the intersection of self with other (3)', function () {
            var a = geoExtent([0, 0], [5, 5]),
                b = geoExtent([3, 3], [4, 7]);
            expect(a.intersection(geoExtent(b))).toEqual(geoExtent([3, 3], [4, 5]));
            expect(b.intersection(geoExtent(a))).toEqual(geoExtent([3, 3], [4, 5]));
        });

        it('returns the intersection of self with other (4)', function () {
            var a = geoExtent([0, 0], [5, 5]),
                b = geoExtent([3, -2], [4, 2]);
            expect(a.intersection(geoExtent(b))).toEqual(geoExtent([3, 0], [4, 2]));
            expect(b.intersection(geoExtent(a))).toEqual(geoExtent([3, 0], [4, 2]));
        });

        it('returns the intersection of self with other (5)', function () {
            var a = geoExtent([0, 0], [5, 5]),
                b = geoExtent([1, 1], [2, 2]);
            expect(a.intersection(geoExtent(b))).toEqual(geoExtent([1, 1], [2, 2]));
            expect(b.intersection(geoExtent(a))).toEqual(geoExtent([1, 1], [2, 2]));
        });
    });

    describe('#percentContainedIn', function () {
        it('returns a 0 if self does not intersect other', function () {
            var a = geoExtent([0, 0], [1, 1]),
                b = geoExtent([0, 3], [4, 1]);
            expect(a.percentContainedIn(geoExtent(b))).toEqual(0);
            expect(b.percentContainedIn(geoExtent(a))).toEqual(0);
        });

        it('returns the percent contained of self with other (1)', function () {
            var a = geoExtent([0, 0], [2, 1]),
                b = geoExtent([1, 0], [3, 1]);
            expect(a.percentContainedIn(geoExtent(b))).toEqual(0.5);
            expect(b.percentContainedIn(geoExtent(a))).toEqual(0.5);
        });

        it('returns the percent contained of self with other (2)', function () {
            var a = geoExtent([0, 0], [4, 1]),
                b = geoExtent([3, 0], [4, 2]);
            expect(a.percentContainedIn(geoExtent(b))).toEqual(0.25);
            expect(b.percentContainedIn(geoExtent(a))).toEqual(0.5);
        });

    });

    describe('#split', function () {
        // needs F-geo-4
        it.todo('splits into four parts');
    });

});
