# Draft for `@tilda-geo/bicycle-infrastructure`: the riding direction of the way itself

For: `FixMyBerlin/tilda-schemas`, `packages/bicycle-infrastructure/src/derive/derive-oneway.ts` (0.4.0). Maid works
around it in `packages/module-bike-infrastructure/src/features.ts` (`ridingDirection`) until the package has it.

## Problem

`processBikelanes` gives each part `oneway` and, for a road side, `_lineReversed`. For the way itself (`_side: self`)
`onewayValue` turns `oneway=-1` and `oneway:bicycle=-1` into `yes`, and `sideLineReversed` is always false. tilda-geo
can do that because it reverses the published line of a `-1` way; an editor shows the line as it is in OSM, so it has
to read the tags again to know that `yes` means "against the line" there.

There is no list of directional keys that change their meaning with `-1` either, and none is needed: `:left`,
`:right`, `:forward` and `:backward` always follow the drawing direction. What `-1` changes is the derived direction
of the sides (`defaultSideRunsAgainstWay`, `_lineReversed`), which the package already exports.

## Proposal

Set `_lineReversed` for `self` too: true when the way's bicycle direction (`oneway:bicycle` when it is `yes` or `-1`,
else `oneway`) is `-1`. Then `oneway` plus `_lineReversed` give every part's direction against its OSM line, and an
editor needs no tag logic of its own. tilda-geo's export would keep reversing the line and can ignore the flag for
`self`.
