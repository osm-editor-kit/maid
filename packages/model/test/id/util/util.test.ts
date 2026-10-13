// Adopted from iD test/spec/util/util.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'
import * as sdk from '../../sdk.ts'
import { utilOldestID } from '../../../src/util/ids.ts'
import { combinedTags, combinedToId } from '../../../src/util/combined-tags.ts'

// chai's to.have.members (the same items, in any order); bun's expect has no such matcher.
function expectMembers(actual: unknown[], expected: unknown[]) {
    expect(actual).toHaveLength(expected.length)
    for (const item of expected) expect(actual).toContainEqual(item)
}
const context = new Rapid.MockContext()


describe('iD.util', function() {

    describe('utilGetAllNodes', function() {
        it('gets all descendant nodes of a way', function() {
            var a = new Rapid.OsmNode(context, { id: 'a' });
            var b = new Rapid.OsmNode(context, { id: 'b' });
            var w = new Rapid.OsmWay(context, { id: 'w', nodes: ['a','b','a'] });
            var graph = new Rapid.Graph(context, [a, b, w]);
            var result = sdk.utilGetAllNodes(['w'], graph);

            expectMembers(result, [a, b]);
            expect(result).toHaveLength(2);
        });

        it('gets all descendant nodes of a relation', function() {
            var a = new Rapid.OsmNode(context, { id: 'a' });
            var b = new Rapid.OsmNode(context, { id: 'b' });
            var c = new Rapid.OsmNode(context, { id: 'c' });
            var w = new Rapid.OsmWay(context, { id: 'w', nodes: ['a','b','a'] });
            var r = new Rapid.OsmRelation(context, { id: 'r', members: [{id: 'w'}, {id: 'c'}] });
            var graph = new Rapid.Graph(context, [a, b, c, w, r]);
            var result = sdk.utilGetAllNodes(['r'], graph);

            expectMembers(result, [a, b, c]);
            expect(result).toHaveLength(3);
        });

        it('gets all descendant nodes of multiple ids', function() {
            var a = new Rapid.OsmNode(context, { id: 'a' });
            var b = new Rapid.OsmNode(context, { id: 'b' });
            var c = new Rapid.OsmNode(context, { id: 'c' });
            var d = new Rapid.OsmNode(context, { id: 'd' });
            var e = new Rapid.OsmNode(context, { id: 'e' });
            var w1 = new Rapid.OsmWay(context, { id: 'w1', nodes: ['a','b','a'] });
            var w2 = new Rapid.OsmWay(context, { id: 'w2', nodes: ['c','b','a','c'] });
            var r = new Rapid.OsmRelation(context, { id: 'r', members: [{id: 'w1'}, {id: 'd'}] });
            var graph = new Rapid.Graph(context, [a, b, c, d, e, w1, w2, r]);
            var result = sdk.utilGetAllNodes(['r', 'w2', 'e'], graph);

            expectMembers(result, [a, b, c, d, e]);
            expect(result).toHaveLength(5);
        });

        it('handles recursive relations', function() {
            var a = new Rapid.OsmNode(context, { id: 'a' });
            var r1 = new Rapid.OsmRelation(context, { id: 'r1', members: [{id: 'r2'}] });
            var r2 = new Rapid.OsmRelation(context, { id: 'r2', members: [{id: 'r1'}, {id: 'a'}] });
            var graph = new Rapid.Graph(context, [a, r1, r2]);
            var result = sdk.utilGetAllNodes(['r1'], graph);

            expectMembers(result, [a]);
            expect(result).toHaveLength(1);
        });
    });

    describe('utilTagDiff', function() {
        it('returns the difference of two sets of tags', function() {
            var oldTags = { a: 'one', b: 'two', c: 'three' };
            var newTags = { a: 'one', b: 'three', d: 'four' };
            var diff = sdk.utilTagDiff(oldTags, newTags);
            expect(diff).toHaveLength(4);
            expect(sdk.utilObjectOmit(diff[0], ['render'])).toEqual({
                type: '-', key: 'b', oldVal: 'two', newVal: 'three', display: '- b=two'        // delete-modify
            });
            expect(sdk.utilObjectOmit(diff[1], ['render'])).toEqual({
                type: '+', key: 'b', oldVal: 'two', newVal: 'three', display: '+ b=three'      // insert-modify
            });
            expect(sdk.utilObjectOmit(diff[2], ['render'])).toEqual({
                type: '-', key: 'c', oldVal: 'three', newVal: undefined, display: '- c=three'  // delete
            });
            expect(sdk.utilObjectOmit(diff[3], ['render'])).toEqual({
                type: '+', key: 'd', oldVal: undefined, newVal: 'four', display: '+ d=four'    // insert
            });
        });

        // needs F-util-6
        it.todo('includes context tags if requested')
    });

    describe('utilCombinedTags', function() {
        // Through combinedToId (src/util/combined-tags.ts): iD's shape of the typed combined tags.
        it('sorts tag values by frequency then alphabetically', function() {
            const result = combinedToId(combinedTags([
                { surface: 'paved' },
                { surface: 'paved' },
                { surface: 'paved' },
                { surface: 'asphalt' },
                { surface: 'gravel' },
            ]));

            expect(result.surface).toBeInstanceOf(Array);
            expect(result.surface[0]).toEqual('paved');
            expect(result.surface[1]).toEqual('asphalt');
            expect(result.surface[2]).toEqual('gravel');
        });

        it('returns raw value when all entities share the same tag value', function() {
            const result = combinedToId(combinedTags([
                { highway: 'residential' },
                { highway: 'residential' },
            ]));

            expect(result.highway).toEqual('residential');
        });
    });



    it('utilTagText', function() {
        expect(sdk.utilTagText({})).toEqual('');
        expect(sdk.utilTagText({tags:{foo:'bar'}})).toEqual('foo=bar');
        expect(sdk.utilTagText({tags:{foo:'bar',two:'three'}})).toEqual('foo=bar, two=three');
    });

    describe('utilStringQs', function() {
        // needs F-util-14
        it.todo('splits a parameter string into k=v pairs')
        it('trims leading # if present', function() {
            expect(sdk.utilStringQs('#foo=bar')).toEqual({foo: 'bar'});
        });
        it('trims leading ? if present', function() {
            expect(sdk.utilStringQs('?foo=bar')).toEqual({foo: 'bar'});
        });
        it('trims leading #? if present', function() {
            expect(sdk.utilStringQs('#?foo=bar')).toEqual({foo: 'bar'});
        });
        // needs F-util-14
        it.todo('supports both + and %20 for escaping spaces')
    });

    it('utilQsString', function() {
        expect(sdk.utilQsString({})).toEqual('');
        expect(sdk.utilQsString({ foo: 'bar' })).toEqual('foo=bar');
        expect(sdk.utilQsString({ foo: 'bar', one: 2 })).toEqual('foo=bar&one=2');
        expect(sdk.utilQsString({ foo: 'bar baz' })).toBeOneOf(['foo=bar%20baz', 'foo=bar+baz']);
        expect(sdk.utilQsString({ foo: 'bar/baz' })).toEqual('foo=bar%2Fbaz');
        expect(sdk.utilQsString({ foo: 'bar/baz' }, true)).toEqual('foo=bar/baz');
    });

    describe('utilEditDistance', function() {
        it('returns zero for same strings', function() {
            expect(sdk.utilEditDistance('foo', 'foo')).toEqual(0);
        });

        it('reports an insertion of 1', function() {
            expect(sdk.utilEditDistance('foo', 'fooa')).toEqual(1);
        });

        it('reports a replacement of 1', function() {
            expect(sdk.utilEditDistance('foob', 'fooa')).toEqual(1);
        });

        it('does not fail on empty input', function() {
            expect(sdk.utilEditDistance('', '')).toEqual(0);
        });
    });

    describe('utilEditDistance, for substring', function() {
        // needs F-util-8
        it.todo('returns zero for same strings')
        it.todo('returns zero for exact substring match')
        it.todo('reports an insertion of 1')
        it.todo('reports a replacement of 1')
        it.todo('does not fail on empty input')
        it.todo('while (mis)typing')
    });

    describe('utilUnicodeCharsCount', function() {
        it('counts empty string', function() {
            expect(sdk.utilUnicodeCharsCount('')).toEqual(0);
        });
        it('counts latin text', function() {
            expect(sdk.utilUnicodeCharsCount('Lorem')).toEqual(5);
        });
        it('counts diacritics', function() {
            expect(sdk.utilUnicodeCharsCount('Ĺo͂řȩm̅')).toEqual(7);
        });
        it('counts Korean text', function() {
            expect(sdk.utilUnicodeCharsCount('뎌쉐')).toEqual(2);
        });
        it('counts Hindi text with combining marks', function() {
            expect(sdk.utilUnicodeCharsCount('अनुच्छेद')).toEqual(8);
        });
        it('counts demonic multiple combining marks', function() {
            expect(sdk.utilUnicodeCharsCount('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖̬̰̙̗̿̋ͥͥ̂ͣ̐́́͜͞')).toEqual(74);
        });
        it('counts emoji', function() {
            // The `Array.from` polyfill may not account for emojis, so
            // be lenient here. Worst case scenario is that IE users might be
            // limited to somewhat fewer characters on tag and role input.
            expect(sdk.utilUnicodeCharsCount('😎')).toBeOneOf([1, 2]);
            expect(sdk.utilUnicodeCharsCount('🇨🇦')).toBeOneOf([2, 4]);
            expect(sdk.utilUnicodeCharsCount('🏳️‍🌈')).toBeOneOf([4, 6]);
            expect(sdk.utilUnicodeCharsCount('‍👩‍👩‍👧‍👧')).toBeOneOf([8, 12]);
            expect(sdk.utilUnicodeCharsCount('👩‍❤️‍💋‍👩')).toBeOneOf([8, 11]);
            expect(sdk.utilUnicodeCharsCount('😎😬😆😵😴😄🙂🤔')).toBeOneOf([8, 16]);
        });
    });

    describe('utilUnicodeCharsTruncated', function() {
        it('truncates empty string', function() {
            expect(sdk.utilUnicodeCharsTruncated('', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('', 255)).toEqual('');
        });
        it('truncates latin text', function() {
            expect(sdk.utilUnicodeCharsTruncated('Lorem', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('Lorem', 3)).toEqual('Lor');
            expect(sdk.utilUnicodeCharsTruncated('Lorem', 5)).toEqual('Lorem');
            expect(sdk.utilUnicodeCharsTruncated('Lorem', 255)).toEqual('Lorem');
        });
        it('truncates diacritics', function() {
            expect(sdk.utilUnicodeCharsTruncated('Ĺo͂řȩm̅', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('Ĺo͂řȩm̅', 3)).toEqual('Ĺo͂');
            expect(sdk.utilUnicodeCharsTruncated('Ĺo͂řȩm̅', 7)).toEqual('Ĺo͂řȩm̅');
            expect(sdk.utilUnicodeCharsTruncated('Ĺo͂řȩm̅', 255)).toEqual('Ĺo͂řȩm̅');
        });
        it('truncates Korean text', function() {
            expect(sdk.utilUnicodeCharsTruncated('뎌쉐', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('뎌쉐', 1)).toEqual('뎌');
            expect(sdk.utilUnicodeCharsTruncated('뎌쉐', 2)).toEqual('뎌쉐');
            expect(sdk.utilUnicodeCharsTruncated('뎌쉐', 255)).toEqual('뎌쉐');
        });
        it('truncates Hindi text with combining marks', function() {
            expect(sdk.utilUnicodeCharsTruncated('अनुच्छेद', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('अनुच्छेद', 3)).toEqual('अनु');
            expect(sdk.utilUnicodeCharsTruncated('अनुच्छेद', 8)).toEqual('अनुच्छेद');
            expect(sdk.utilUnicodeCharsTruncated('अनुच्छेद', 255)).toEqual('अनुच्छेद');
        });
        it('truncates demonic multiple combining marks', function() {
            expect(sdk.utilUnicodeCharsTruncated('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖̬̰̙̗̿̋ͥͥ̂ͣ̐́́͜͞', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖', 59)).toEqual('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖');
            expect(sdk.utilUnicodeCharsTruncated('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖̬̰̙̗̿̋ͥͥ̂ͣ̐́́͜͞', 74)).toEqual('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖̬̰̙̗̿̋ͥͥ̂ͣ̐́́͜͞');
            expect(sdk.utilUnicodeCharsTruncated('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖̬̰̙̗̿̋ͥͥ̂ͣ̐́́͜͞', 255)).toEqual('Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍A̴̵̜̰͔ͫ͗͢L̠ͨͧͩ͘G̴̻͈͍͔̹̑͗̎̅͛́Ǫ̵̹̻̝̳͂̌̌͘!͖̬̰̙̗̿̋ͥͥ̂ͣ̐́́͜͞');
        });
        it('truncates emoji', function() {
            expect(sdk.utilUnicodeCharsTruncated('😎', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('😎', 1)).toBeOneOf(['😎', '\ud83d']);
            expect(sdk.utilUnicodeCharsTruncated('🇨🇦', 1)).toBeOneOf(['🇨', '\ud83c']);
            expect(sdk.utilUnicodeCharsTruncated('🏳️‍🌈', 2)).toBeOneOf(['🏳️', '\ud83c\udff3']);
            expect(sdk.utilUnicodeCharsTruncated('‍👩‍👩‍👧‍👧', 4)).toBeOneOf(['‍👩‍👩', '‍👩‍']);
            expect(sdk.utilUnicodeCharsTruncated('👩‍❤️‍💋‍👩', 6)).toBeOneOf(['👩‍❤️‍💋', '👩‍❤️‍']);
            expect(sdk.utilUnicodeCharsTruncated('😎😬😆😵😴😄🙂🤔', 0)).toEqual('');
            expect(sdk.utilUnicodeCharsTruncated('😎😬😆😵😴😄🙂🤔', 4)).toBeOneOf(['😎😬😆😵', '😎😬']);
            expect(sdk.utilUnicodeCharsTruncated('😎😬😆😵😴😄🙂🤔', 8)).toBeOneOf(['😎😬😆😵😴😄🙂🤔', '😎😬😆😵']);
            expect(sdk.utilUnicodeCharsTruncated('😎😬😆😵😴😄🙂🤔', 16)).toEqual('😎😬😆😵😴😄🙂🤔');
            expect(sdk.utilUnicodeCharsTruncated('😎😬😆😵😴😄🙂🤔', 255)).toEqual('😎😬😆😵😴😄🙂🤔');
        });
    });

    describe('utilCompareIDs', function() {
        // needs F-util-12
        it.todo('sorts existing IDs numerically in ascending order')
        it.todo('sorts new IDs numerically in descending order')
        it.todo('sorts existing IDs before new IDs')
        it.todo('sorts existing and new IDs before anything else')
        it.todo('returns -1 for other strings')
    });

    describe('utilDisplayName', function() {
        // needs F-util-9
        it.todo('returns the name if tagged with a name')
        it.todo('returns just the name for non-routes')
        it.todo('returns just the name for route with PTv2-formatted names')
        it.todo('suppresses the network tag if the hideNetwork argument is true')
        it.todo('suppresses the ref tag if the hideRef argument is true')
        it.todo('distinguishes unnamed features by ref')
        it.todo('distinguishes unnamed features by network or cycle_network')
        it.todo('distinguishes unnamed routes by direction')
        it.todo('distinguishes unnamed routes by waypoints')
        it.todo('can use alternative name tags')
        it.todo('prefers standard tags over alternative names')
        it.todo('distinguishes named features by name')
        it.todo('distinguishes named features by network or cycle_network')
        it.todo('distinguishes named features by ref')
        it.todo('distinguishes named features by direction')
        it.todo('distinguishes named features by waypoints')
        it.todo('uses addr:housename')
        it.todo('uses the street address (addr:street) as a last resort')
        it.todo('uses the street address (addr:place) as a last resort')
        it.todo('uses addr:unit if present')
        it.todo('uses just addr:housenumber if it is the only addr: tag present')
        it.todo('uses only the housenumber for map labels')
        it.todo('considers the original locale code first')
        it.todo('fallbacks to the maximized locale')
    });

    describe('utilOldestID', function() {
        it('returns the oldest database ID', () => {
            expect(utilOldestID(['w3', 'w1', 'w2'])).toEqual('w1')
        })
        it('returns the oldest editor ID', () => {
            expect(utilOldestID(['w-3', 'w-2', 'w-1'])).toEqual('w-1')
        })
        it('returns the oldest IDs among database and editor IDs', () => {
            expect(utilOldestID(['w-1', 'w1', 'w-2'])).toEqual('w1')
            expect(utilOldestID(['w100', 'w-1', 'a', 'w-300', 'w2'])).toEqual('w2')
        })
        it('returns the oldest editor ID if no database IDs', () => {
            expect(utilOldestID(['w-100', 'w-1', 'a', 'w-300', 'w-2'])).toEqual('w-1')
        })
        it('returns the first ID in the list otherwise', () => {
            expect(utilOldestID(['z', 'a', 'A', 'Z'])).toEqual('z')
        })
    });

    describe('utilStripDiacritics', function() {
        // needs F-util-11
        it.todo('strips diacritics')
    });
});
