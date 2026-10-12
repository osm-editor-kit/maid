// Adopted from iD test/spec/geo/vector.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import * as sdk from '../../sdk.ts'

describe('iD.geo - vector', () => {
    describe('geoVecEqual', function() {
        it('tests vectors for exact equality', function() {
            expect(sdk.vecEqual([1, 2], [1, 2])).toBe(true);
            expect(sdk.vecEqual([1, 2], [1, 0])).toBe(false);
            expect(sdk.vecEqual([1, 2], [2, 1])).toBe(false);
        });
        it('tests vectors for equality within epsilon', function() {
            expect(sdk.vecEqual([1, 2], [1.0000001, 2.0000001], 1e-5)).toBe(true);
            expect(sdk.vecEqual([1, 2], [1.0000001, 2.0000001], 1e-8)).toBe(false);
        });
    });

    describe('geoVecAdd', function() {
        it('adds vectors', function() {
            expect(sdk.vecAdd([1, 2], [3, 4])).toEqual([4, 6]);
            expect(sdk.vecAdd([1, 2], [0, 0])).toEqual([1, 2]);
            expect(sdk.vecAdd([1, 2], [-3, -4])).toEqual([-2, -2]);
        });
    });

    describe('geoVecSubtract', function() {
        it('subtracts vectors', function() {
            expect(sdk.vecSubtract([1, 2], [3, 4])).toEqual([-2, -2]);
            expect(sdk.vecSubtract([1, 2], [0, 0])).toEqual([1, 2]);
            expect(sdk.vecSubtract([1, 2], [-3, -4])).toEqual([4, 6]);
        });
    });

    describe('geoVecScale', function() {
        it('multiplies vectors', function() {
            expect(sdk.vecScale([1, 2], 0)).toEqual([0, 0]);
            expect(sdk.vecScale([1, 2], 1)).toEqual([1, 2]);
            expect(sdk.vecScale([1, 2], 2)).toEqual([2, 4]);
            expect(sdk.vecScale([1, 2], 0.5)).toEqual([0.5, 1]);
        });
    });

    describe('geoVecFloor (was: geoRoundCoordinates)', function() {
        it('rounds vectors', function() {
            expect(sdk.vecFloor([0.1, 1])).toEqual([0, 1]);
            expect(sdk.vecFloor([0, 1])).toEqual([0, 1]);
            expect(sdk.vecFloor([0, 1.1])).toEqual([0, 1]);
        });
    });

    describe('geoVecInterp', function() {
        it('interpolates halfway', function() {
            var a = [0, 0];
            var b = [10, 10];
            expect(sdk.vecInterp(a, b, 0.5)).toEqual([5, 5]);
        });
        it('interpolates to one side', function() {
            var a = [0, 0];
            var b = [10, 10];
            expect(sdk.vecInterp(a, b, 0)).toEqual([0, 0]);
        });
    });

    describe('geoVecLength (was: geoEuclideanDistance)', function() {
        it('distance between two same points is zero', function() {
            var a = [0, 0];
            var b = [0, 0];
            expect(sdk.vecLength(a, b)).toEqual(0);
        });
        it('a straight 10 unit line is 10', function() {
            var a = [0, 0];
            var b = [10, 0];
            expect(sdk.vecLength(a, b)).toEqual(10);
        });
        it('a pythagorean triangle is right', function() {
            var a = [0, 0];
            var b = [4, 3];
            expect(sdk.vecLength(a, b)).toEqual(5);
        });
    });

    describe('geoVecNormalize', function() {
        it('gets unit vectors', function() {
            expect(sdk.vecNormalize([0, 0])).toEqual([0, 0]);
            expect(sdk.vecNormalize([1, 0])).toEqual([1, 0]);
            expect(sdk.vecNormalize([5, 0])).toEqual([1, 0]);
            expect(sdk.vecNormalize([-5, 0])).toEqual([-1, 0]);
            expect(sdk.vecNormalize([1, 1])[0]).toBeCloseTo(Math.sqrt(2)/2, 6);
            expect(sdk.vecNormalize([1, 1])[1]).toBeCloseTo(Math.sqrt(2)/2, 6);
        });
    });

    describe('geoVecAngle', function() {
        it('returns angle between a and b', function() {
            expect(sdk.vecAngle([0, 0], [1, 0])).toBeCloseTo(0, 6);
            expect(sdk.vecAngle([0, 0], [0, 1])).toBeCloseTo(Math.PI / 2, 6);
            expect(sdk.vecAngle([0, 0], [-1, 0])).toBeCloseTo(Math.PI, 6);
            expect(sdk.vecAngle([0, 0], [0, -1])).toBeCloseTo(-Math.PI / 2, 6);
        });
    });

    describe('geoVecDot', function() {
        it('dot product of right angle is zero', function() {
            var a = [1, 0];
            var b = [0, 1];
            expect(sdk.vecDot(a, b)).toEqual(0);
        });
        it('dot product of same vector multiplies', function() {
            var a = [2, 0];
            var b = [2, 0];
            expect(sdk.vecDot(a, b)).toEqual(4);
        });
    });

    describe('geoVecNormalizedDot', function() {
        it('normalized dot product of right angle is zero', function() {
            var a = [2, 0];
            var b = [0, 2];
            expect(sdk.vecNormalizedDot(a, b)).toEqual(0);
        });
        it('normalized dot product of same vector multiplies unit vectors', function() {
            var a = [2, 0];
            var b = [2, 0];
            expect(sdk.vecNormalizedDot(a, b)).toEqual(1);
        });
        it('normalized dot product of 45 degrees', function() {
            var a = [0, 2];
            var b = [2, 2];
            expect(sdk.vecNormalizedDot(a, b)).toBeCloseTo(Math.sqrt(2)/2, 6);
        });
    });

    describe('geoVecCross', function() {
        it('2D cross product of right hand turn is positive', function() {
            var a = [2, 0];
            var b = [0, 2];
            expect(sdk.vecCross(a, b)).toEqual(4);
        });
        it('2D cross product of left hand turn is negative', function() {
            var a = [2, 0];
            var b = [0, -2];
            expect(sdk.vecCross(a, b)).toEqual(-4);
        });
        it('2D cross product of colinear points is zero', function() {
            var a = [-2, 0];
            var b = [2, 0];
            expect(sdk.vecCross(a, b)).toEqual(-0);
        });
    });

    describe('geoVecProject', function() {
        it('returns null for a degenerate path (no nodes)', function() {
            expect(sdk.vecProject([0, 1], [])).toBeNull();
        });

        it('returns null for a degenerate path (single node)', function() {
            expect(sdk.vecProject([0, 1], [0, 0])).toBeNull();
        });

        it('calculates the orthogonal projection of a point onto a path', function() {
            //     c
            //     |
            // a --*--- b
            //
            // * = [2, 0]
            var a = [0, 0];
            var b = [5, 0];
            var c = [2, 1];
            var choice = sdk.vecProject(c, [a, b]);
            expect(choice.index).toEqual(1);
            expect(choice.distance).toEqual(1);
            expect(choice.point).toEqual([2, 0]);
        });

        it('returns the starting vertex when the orthogonal projection is < 0', function() {
            var a = [0, 0];
            var b = [5, 0];
            var c = [-3, 4];
            var choice = sdk.vecProject(c, [a, b]);
            expect(choice.index).toEqual(1);
            expect(choice.distance).toEqual(5);
            expect(choice.point).toEqual([0, 0]);
        });

        it('returns the ending vertex when the orthogonal projection is > 1', function() {
            var a = [0, 0];
            var b = [5, 0];
            var c = [8, 4];
            var choice = sdk.vecProject(c, [a, b]);
            expect(choice.index).toEqual(1);
            expect(choice.distance).toEqual(5);
            expect(choice.point).toEqual([5, 0]);
        });
    });
})
