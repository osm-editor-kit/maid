# osm-way-chain: `mirrorTags` should not reverse lane pipes or swap turns

For: `@osm-editor-kit/osm-way-chain` (npm, 1.0.1). Drafted in Maid on 2026-11-12, to hand to a person.

## What happens

`mirrorTags` (and `normalizeTagsForDirection(tags, true)`) reverses every `*:lanes` pipe and swaps `left` and `right` in
turn values:

```ts
mirrorTags({ oneway: 'yes', 'turn:lanes': 'left|through' })
// { oneway: '-1', 'turn:lanes': 'through|right' }

mirrorTags({ 'turn:lanes:forward': 'left|through' })
// { 'turn:lanes:backward': 'through|right' }
```

## Why that is wrong

The values of a `:lanes` key run left to right in the direction of travel of their lanes, and a turn value is what the
driver does. Drawing the way the other way round changes neither: the travel is the same. Only the `:forward` and
`:backward` suffixes swap (iD's reverse action does the same and leaves the values alone). The lane count keys
(`lanes:forward`, `lanes:backward`) swap as they do now.

With the current behaviour `osm-lanes` read a `oneway=-1` road with `turn:lanes=left|through` as `through|right`.

## Fix in Maid

`packages/osm-lanes/src/reverse.ts`, `reverseWayTags`: `mirrorTags`, then the lane keys are taken from the input with
only the suffix swapped. Tests: `packages/osm-lanes/src/reverse.test.ts`. Once `mirrorTags` does this itself, the
wrapper can go.

## Open question

`placement=*`: `mirrorTags` turns `placement:forward=left_of:1` into `placement:backward=right_of:1`. If placement
counts lanes from the left in their travel (as the `:lanes` keys do), the value should stay `left_of:1`. To check
against the wiki before changing it.
