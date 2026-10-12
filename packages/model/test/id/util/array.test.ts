// Adopted from iD test/spec/util/array.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'
import * as sdk from '../../sdk.ts'

// chai's to.have.members (the same items, in any order); bun's expect has no such matcher.
function expectMembers(actual: unknown[], expected: unknown[]) {
    expect(actual).toHaveLength(expected.length)
    for (const item of expected) expect(actual).toContainEqual(item)
}

describe('iD.utilArray', function() {
    it('utilArrayDifference returns difference of two Arrays', function() {
        var a = [1, 2, 3];
        var b = [4, 3, 2];
        expect(sdk.utilArrayDifference([], [])).toEqual([]);
        expect(sdk.utilArrayDifference([], a)).toEqual([]);
        expectMembers(sdk.utilArrayDifference(a, []), [1, 2, 3]);
        expectMembers(sdk.utilArrayDifference(a, b), [1]);
        expectMembers(sdk.utilArrayDifference(b, a), [4]);
    });

    it('utilArrayIntersection returns intersection of two Arrays', function() {
        var a = [1, 2, 3];
        var b = [4, 3, 2];
        expect(sdk.utilArrayIntersection([], [])).toEqual([]);
        expect(sdk.utilArrayIntersection([], a)).toEqual([]);
        expect(sdk.utilArrayIntersection(a, [])).toEqual([]);
        expectMembers(sdk.utilArrayIntersection(a, b), [2, 3]);
        expectMembers(sdk.utilArrayIntersection(b, a), [2, 3]);
    });

    it('utilArrayUnion returns union of two Arrays', function() {
        var a = [1, 2, 3];
        var b = [4, 3, 2];
        expect(sdk.utilArrayUnion([], [])).toEqual([]);
        expectMembers(sdk.utilArrayUnion([], a), [1, 2, 3]);
        expectMembers(sdk.utilArrayUnion(a, []), [1, 2, 3]);
        expectMembers(sdk.utilArrayUnion(a, b), [1, 2, 3, 4]);
        expectMembers(sdk.utilArrayUnion(b, a), [1, 2, 3, 4]);
    });

    it('utilArrayUniq returns unique values in an Array', function() {
        var a = [1, 1, 2, 3, 3];
        expect(sdk.utilArrayUniq([])).toEqual([]);
        expectMembers(sdk.utilArrayUniq(a), [1, 2, 3]);
    });

    it('utilArrayChunk returns array split into given sized chunks', function() {
        var a = [1, 2, 3, 4, 5, 6, 7];
        // bad chunkSizes, just copy whole array into a single chunk
        expect(sdk.utilArrayChunk(a)).toEqual([[1, 2, 3, 4, 5, 6, 7]]);
        expect(sdk.utilArrayChunk(a, -1)).toEqual([[1, 2, 3, 4, 5, 6, 7]]);
        expect(sdk.utilArrayChunk(a, 0)).toEqual([[1, 2, 3, 4, 5, 6, 7]]);
        // good chunkSizes
        expect(sdk.utilArrayChunk(a, 2)).toEqual([[1, 2], [3, 4], [5, 6], [7]]);
        expect(sdk.utilArrayChunk(a, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
        expect(sdk.utilArrayChunk(a, 4)).toEqual([[1, 2, 3, 4], [5, 6, 7]]);
    });

    it('utilArrayFlatten returns two level array as single level', function() {
        var a = [[1, 2, 3], [4, 5, 6], [7]];
        expect(sdk.utilArrayFlatten(a)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    describe('utilArrayGroupBy', function() {
        var pets = [
            { type: 'Dog', name: 'Spot' },
            { type: 'Cat', name: 'Tiger' },
            { type: 'Dog', name: 'Rover' },
            { type: 'Cat', name: 'Leo' }
        ];

        it('groups by key property', function() {
            var expected = {
                'Dog': [{type: 'Dog', name: 'Spot'}, {type: 'Dog', name: 'Rover'}],
                'Cat': [{type: 'Cat', name: 'Tiger'}, {type: 'Cat', name: 'Leo'}]
            };
            expect(sdk.utilArrayGroupBy(pets, 'type')).toEqual(expected);
        });

        it('groups by key function', function() {
            var expected = {
                3: [{type: 'Cat', name: 'Leo'}],
                4: [{type: 'Dog', name: 'Spot'}],
                5: [{type: 'Cat', name: 'Tiger'}, {type: 'Dog', name: 'Rover'}]
            };
            var keyFn = function(item) { return item.name.length; };
            expect(sdk.utilArrayGroupBy(pets, keyFn)).toEqual(expected);
        });

        it('undefined key function', function() {
            var expected = {
                undefined: pets
            };
            expect(sdk.utilArrayGroupBy(pets)).toEqual(expected);
        });
    });

    describe('utilArrayUniqBy', function() {
        var pets = [
            { type: 'Dog', name: 'Spot' },
            { type: 'Cat', name: 'Tiger' },
            { type: 'Dog', name: 'Rover' },
            { type: 'Cat', name: 'Leo' }
        ];

        it('groups by key property', function() {
            var expected = [
                { type: 'Dog', name: 'Spot' },
                { type: 'Cat', name: 'Tiger' }
                //{ type: 'Dog', name: 'Rover' },   // not unique by type
                //{ type: 'Cat', name: 'Leo' }      // not unique by type
            ];
            expect(sdk.utilArrayUniqBy(pets, 'type')).toEqual(expected);
        });

        it('groups by key function', function() {
            var expected = [
                { type: 'Dog', name: 'Spot' },
                { type: 'Cat', name: 'Tiger' },
                //{ type: 'Dog', name: 'Rover' },   // not unique by name length
                { type: 'Cat', name: 'Leo' }
            ];
            var keyFn = function(item) { return item.name.length; };
            expect(sdk.utilArrayUniqBy(pets, keyFn)).toEqual(expected);
        });

        it('undefined key function', function() {
            expect(sdk.utilArrayUniqBy(pets)).toEqual([]);
        });
    });

    describe('iD.utilArrayPowerset', () => {
        // needs F-util-1
        it.todo('can generate a powerset')
    });
});
