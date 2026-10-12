// Adopted from iD test/spec/util/object.ts (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'
import * as sdk from '../../sdk.ts'

describe('iD.utilObjectOmit', function() {
    it('omits keys', function() {
        var t = { a: 1, b: 2 };
        expect(sdk.utilObjectOmit(t, [])).toEqual({ a: 1, b: 2 });
        expect(sdk.utilObjectOmit(t, ['a'])).toEqual({ b: 2 });
        expect(sdk.utilObjectOmit(t, ['a', 'b'])).toEqual({});
    });
});


describe('iD.utilCheckTagDictionary', () => {
    // needs F-util-4
    it.todo('can search a standard tag-dictionary')

    // needs F-util-4
    it.todo('works for falsy values')
});

describe('stringifyProperties', () => {
    // needs F-util-5
    it.todo('converts object properties to a string')
});
