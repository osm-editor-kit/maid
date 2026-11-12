# Side paths module (`@osm-editor-kit/maid-module-sidepaths`)

Side paths for the bicycle editor, as the iD fork iD-Radnetz (FixMyBerlin) handles them. A road with a cycle track or a sidewalk mapped as its own way gets edit-menu entries to extract that side into a new way, to merge it with the footway beside it, and to move the side's attributes to the separate way.

## What a person sees / can do

- Edit menu "Tags to left sidewalk", "… right sidewalk", "… both sidewalks" and the same for cycle tracks. A road with `sidewalk:left=separate` that still has `sidewalk:left:surface` and the like gives those attributes to the separate way on that side (as plain `surface`). The road keeps `sidewalk:left=separate` only.
- Edit menu "Extract left cycle track", "… right …", "… both …", and the same for sidewalks. The side becomes a new way parallel to the road, and the road's side is set to `separate`.
- "Extract left as one path" (cycle track and sidewalk as one way).
- "Extract + merge left | right | both": extracts the cycle track and merges it with the footway that runs along it.
- An entry that cannot run is disabled with its reason (for example "No separate sidewalk was found on the left side", "This road is too short to extract a side", "Not all of this road is loaded"). Nothing is changed half-way.
- An extracted way gets its highway and access from the traffic sign rules: a "Radweg" sign makes it `highway=cycleway` and `bicycle=designated`. The rules load on first use.

## Using it in an editor's config

Only `apps/maid-bicycle` switches it on, with no options:

```ts
import { sidepaths } from '@osm-editor-kit/maid-module-sidepaths'

sidepaths(),
```

No Tailwind source is needed: the module has no components.

## Parts

| Part | What it does |
| --- | --- |
| `src/index.ts` | `sidepaths()`: registers the edit-menu entries; exports `separateWays` and `moveSideTagsPlan` |
| `src/operations.ts` | The "Tags to … sidewalk / cycle track" entries (`move-*-tags-*`) |
| `src/side-tags.ts`, `src/move-side-tags.ts` | Pure tag logic and the plan of the move |
| `src/extract.ts`, `src/extract-operations.ts`, `src/extract-merge.ts` | The extraction, its edit-menu entries and the extract-and-merge plans. Each plan runs on a copy of the graph first |
| `src/merge.ts` | Merge of a cycle track and a footway into one path |
| `src/find.ts` | Finds the separate way on a side of a road, by position |
| `src/geometry.ts` | Lengths, distances and the line parallel to a road, in metres |
| `src/sign-rules.ts` | Loads the traffic sign converter's rules on first use |
| `src/messages.ts`, `messages/` | The texts in en, de, fr and es |

## Tests

`bun test packages/module-sidepaths`: the tag moves, the extraction and merge plans, and the side tags.

## More

- Plan, steps and open points: [docs/research/sidepaths.md](../../docs/research/sidepaths.md).
- Steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), entries of 2026-11-10 and 2026-11-11.

Open (from the research doc):

- Many entries on one road with tracks and sidewalks on both sides (up to 12). A flyout in the edit menu would bring back the fork's "Extract …" menu. The menu has no flyout yet.
- Merging two selected ways (a cycle track and a footway) as an entry of its own.
- A preview of the new way when an entry is hovered.
- The campaign's own examples are to be run once Tobias sends the link.

## Notes

German signs only, like the rest of the bicycle editor.
