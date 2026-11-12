# TILDA module (`@osm-editor-kit/maid-module-tilda`)

The TILDA bike infrastructure section for highways. It shows how TILDA (tilda-geo.de) classifies a way and each of its sides, asks the open question that makes an incomplete category exact, and plans the tags for another category. It is the UX of the TILDA box of the iD Radnetz Berlin fork. The logic comes from the `@tilda-geo/*` packages. No network request: everything runs on the tags of the loaded data.

## What a person sees / can do

- An inspector section "TILDA bike infrastructure" on every highway, open by default.
- One card per result: this way, the left side and the right side, each with its TILDA category.
- An open question where the category is incomplete (for example "cycle track, along a road or separate?"). Choosing an answer sets the key it names.
- A question for a footway next to a cycleway: does it belong to this cycleway (`traffic_mode:right=foot`)?
- "Change to": choose a kind and see the tags to reach it as a tag diff. "Apply these tags" writes them as one undo step.
- The attributes that the Radnetz Berlin dataset needs, as a checklist with the value fields, and reminders for things to look at on the ground.
- "Checked" on a reminder or a default, and "Verified" for the whole way. Both are kept in this browser only, not in OpenStreetMap, and nothing is uploaded. "Verified" says when the way was changed since.

## Using it in an editor's config

Only `apps/maid-bicycle` switches it on:

```ts
import { tilda } from '@osm-editor-kit/maid-module-tilda'

tilda(),
```

`tilda({ profile })` takes the dataset's requirements profile. The default is Radnetz Berlin. The `tilda-geo` profile (from `@tilda-geo/bicycle-infrastructure-tagging/profiles/tilda-geo`) asks only for what TILDA itself reads.

`packages/shell/src/styles.css` lists `@source '../../module-tilda/src';`.

## Parts

| Part | What it does |
| --- | --- |
| `src/index.ts` | `tilda(options)`: registers the `inspector.section` on highways; exports the card helpers and the footway helpers |
| `src/TildaSection.tsx` | The section as React: cards, open questions, "Change to", checklist, checks |
| `src/cards.ts` | Without React: the cards per side, the open questions, the planner and the checklist |
| `src/footway.ts` | Finds the footway that runs right next to a cycleway (plain geometry on lon/lat) |
| `src/checks-store.ts` | "Checked", "Verified" and the footway answers, in the browser (a Zustand store persisted in `localStorage`) |
| `src/texts.ts` | The package's texts: German and English from the package, the other languages from the module |
| `messages/`, `src/messages.ts` | The module's own texts in en, de, fr and es |

## Tests

`bun test packages/module-tilda`: the cards and their open questions, the planner's tag diffs, and the footway geometry.

## More

- Steps and the feature list it comes from: [docs/build-out/steps.md](../../docs/build-out/steps.md) (entry "TILDA section", 2026-11-10) and [docs/build-out/radnetz-features.md](../../docs/build-out/radnetz-features.md), rows 8 and 32.
- The one-way options for TILDA: [docs/upstream/tilda-tagging-oneway-options.md](../../docs/upstream/tilda-tagging-oneway-options.md).
- The sides and the sidepaths: [docs/research/sidepaths.md](../../docs/research/sidepaths.md).

Open (from the steps):

- The validation rules of `@tilda-geo/bicycle-infrastructure-tagging/validation` as Maid rules. Not built.
- "Checked" and "Verified" are local. They become shared only when a shared store exists (the fork keeps them in a project database).
- The footway answer on the left side has no effect in TILDA yet: TILDA reads `traffic_mode:right=foot` only.
