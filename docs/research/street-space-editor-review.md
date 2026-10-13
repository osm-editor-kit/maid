# Street space editor review: what Maid can adopt

Date: 2026-10-13. Read-only review of the osm-editor-kit monorepo (street space editor, formerly parking lanes editor). Nothing was installed, built, run or changed in that repository, and no network request was made. Paths in the tables are repo-relative to the monorepo unless they start with `packages/` or `apps/` and are marked "Maid".

Tags used in this note:

- [measured]: I read the code, a package file, a licence file or counted lines or files.
- [inferred]: my reading of names, comments or READMEs. Not run.
- [not checked]: I did not look, or could not check without the network.

## Summary

The monorepo is a Berlin-focused editor for street parking, road width, lanes, surface, bicycle and table views. It is built on React, MapLibre and react-map-gl, like Maid. [measured: `app/package.json`]. Its parking mode is the part Maid's `apps/maid-parking` is meant to replace. Maid's parking module already covers the core parking tag scheme, quick tags, a restriction field, a lens and operations. Most of what the monorepo has that Maid lacks is outside parking: width, lanes and a lane diagram.

The most useful things to take are small, pure and MIT-licensed. The monorepo also depends on two packages with copyleft licences (one AGPL, one GPL). Those must not be copied into Maid, and the GPL one is already a known issue in Maid (see `docs/research/surface-data-licence.md`).

### Top 5 to adopt

1. **Tag migration from the old parking schema to the current one** (M, MIT). The monorepo's `transpose` function (from the osm-parking-tag-updater package) turns `parking:lane:*` and `parking:condition:*` keys into the current `parking:left|right|both` keys. It also returns cases it cannot map as "manual candidates". Maid's `packages/module-parking/src/validation/legacy-schema.ts` only warns about old keys and says no fix is possible. A port would let Maid offer a real fix for the unambiguous cases and leave the rest to the mapper. Port the logic as a pure module in `packages/module-parking`, keep the MIT notice, and do not import from GitHub.
2. **Test cases for parking conditions and migration** (S, MIT). The monorepo has unit tests for conditions, side conditions, parking tag drafts, lane parsing and the tag migration (`app/src/test/parking-conditions.test.ts`, `side-conditions.test.ts`, `tag-migration.test.ts`, `parse-parking-lanes.test.ts`, `parking-tag-draft.test.ts`). They can be used as fixtures to check Maid's `restriction/conditional.ts` and `validation/legacy-schema.ts`. No code is copied.
3. **Street imagery packages: check for a newer alpha** (S, MIT). Maid pins `@osm-editor-kit/street-imagery` 0.1.0-alpha.8 and `street-imagery-react` 0.1.0-alpha.10 in `packages/module-street-imagery/package.json`. The monorepo source is at alpha.10 and alpha.13 [measured]. Whether alpha.13 is on npm was not checked [not checked]. Diff the two and bump if the API holds.
4. **Way side ordering on screen** (S, MIT). `app/src/modes/parking/domain/way-side-order.ts` (96 lines, uses `@turf/bearing` and `@turf/length`) decides which side of a way is "left" on screen. It is pure geometry. Check whether Maid's side rendering in `packages/module-parking/src/lens/` needs the same rule first [not checked].
5. **Road width from tags, as a later width view** (M, MIT). `app/src/modes/width/domain/road-width-from-tags.ts`, `highway-width-fallbacks.ts`, `width-infra-class.ts` and `width-link-filter.ts` estimate road width from tags. Maid has no width feature [measured by grep: no width code in Maid's parking, surface or renderer packages]. Only worth doing if Tobias wants a width view. This needs a scope decision first.

## Candidates

Columns: what it is and where; what Maid has; how to adopt; effort (S/M/L); licence of the source; recommendation with one reason.

### Parking tagging and data

| # | Candidate (monorepo path) | Maid today | How to adopt | Effort | Licence | Recommendation |
|---|---|---|---|---|---|---|
| 1 | Tag migration old to new schema: `app/src/modes/parking/domain/editor/tag-migration.ts`, shim `app/src/shims/osm-tag-updater-transpose.ts`, dependency `osm-parking-tag-updater` (installed copy 0.0.25; `transpose.ts` 123 lines, plus 9 template and util files, 770 lines together) [measured] | Nothing that migrates. `packages/module-parking/src/validation/legacy-schema.ts` warns only, no fix [measured] | Port `transpose` and its templates into `packages/module-parking/src/` as a pure module with tests. Do not import from GitHub. | M | MIT (installed copy's LICENSE: "OSM Verkehrswende Contributors", 2023). The monorepo's package.json has no licence field [measured] | **Adopt now** after Tobias agrees to the port. It is the only ready-made old-to-new mapping found. |
| 2 | Migration dialog: `app/src/modes/parking/controls/editor/TagUpdaterModal.tsx` (old tag to new tags table, one button) [measured] | Nothing | Take the idea: show old and new tags side by side before applying, in Maid's existing dialog style | S | Idea only, no code copied | Adopt with item 1. |
| 3 | Parking tag schema: `app/src/modes/parking/domain/editor/tag-schema.ts` (129 lines: `parking:{side}`, reason, orientation, surface, and dependent keys) [measured] | Schema in `packages/module-parking/src/sides.ts`, `presets/fields.ts`, `buttons/quick-tags.ts` [measured] | Compare key lists and "show this field when" rules against Maid's; take any missing key | S | MIT | Compare now, adopt gaps only. Maid's schema is already close. |
| 4 | Value lists: `app/src/modes/parking/domain/editor/tag-values.ts` (lane, orientation, reason, restriction, surface values, with pictures) and `parking-tag-value-labels.ts` (35 lines) [measured] | Values come from presets and `packages/module-parking/src/presets/` [inferred from file names] | Compare values. Do not copy the pictures: they come from wiki image URLs under `app/src/assets/street_parking/wiki/` [inferred from helper `street-parking-graphics.ts`] | S | MIT for the code. Wiki images are CC BY-SA and not copied | Compare, take value gaps only. |
| 5 | Conditional values parser: `packages/osm-tag-syntax/src/conditional-tag.ts`, `conditional-tag-edit.ts`, `opening-hours.ts` (about 315 lines, 10 files) [measured] | `packages/module-parking/src/restriction/conditional.ts`, `condition.ts`, `field-logic.ts` (Maid's own) [measured] | Use its tests as a cross-check on Maid's parser. Not a dependency: the package is private. | S | Package has no licence field, root is MIT. The `opening_hours` dependency was not checked [not checked] | Later. Use as test cases only. |
| 6 | Old scheme reading (v1 intervals and v2 "scheme" conditions): `app/src/modes/parking/domain/lane-scheme-conditions.ts` (114 lines), `side-conditions.ts` [measured] | Maid reads only the current keys. Old keys are flagged by `legacy-schema.ts` [measured] | Only if Maid should show old data without migrating it. Port the read path, not the write path. | M | MIT (root) | Later, only if item 1 is not enough. |
| 7 | Access condition text and colours: `domain/access-condition.ts` (149 lines), `condition-color.ts`, `legend.ts` (12 categories with colours) [measured] | Lens categories in `packages/module-parking/src/lens/categories.ts`, legend in `packages/module-parking/src/lens/layers.ts` [measured] | Compare colours and categories. Maid already has a parking legend. | S | MIT | No: Maid already has equivalent categories. |
| 8 | Missing surface per side: `domain/missing-surface.ts` (26 lines) [measured] | Surface module in `packages/module-surface/`. Whether it flags a missing surface per side was not checked [not checked] | Port the pure check if Maid lacks it | S | MIT | Compare, adopt if missing. |
| 9 | Quick tag buttons: none found in the monorepo's parking code by name [measured by grep] | 33 buttons in `packages/module-parking/src/buttons/quick-tags.ts` [measured] | Nothing to take | - | - | No: Maid is ahead here. |

### Map, data loading and services

| # | Candidate (monorepo path) | Maid today | How to adopt | Effort | Licence | Recommendation |
|---|---|---|---|---|---|---|
| 10 | Live Overpass fetch and coverage check: `packages/osm-coverage/src/overpass-urls.ts` (overpass-api.de and maps.mail.ru mirror), `create-osm-coverage-api.ts`, `app/src/shell/map/use-map-coverage-lifecycle.ts`; parking view starts at zoom 15 (`app/src/modes/parking/map/constants.ts`) [measured] | Maid reads fixtures from `tools/mock-osm-api`. Live data only with `?live=1` at editing zoom [AGENTS.md] | None. Breaks AGENTS.md core rule 1 (no OSM traffic in automation). | - | MIT (`osm-coverage` has a licence field) | No: policy. Zoom 15 is a useful data point for Maid's zoom study (`docs/research/zoom-study.md`). |
| 11 | Dev map fixture: `app/vite-plugins/dev-osm-map-fixture.ts`, `packages/osm-coverage/src/dev-osm-map-fixture/` [measured] | `tools/mock-osm-api` serves frozen fixtures [AGENTS.md] | Nothing: Maid's version is already the policy-compliant one | - | MIT | No. |
| 12 | OAuth and API client: `packages/osm-oauth/` (`createOsmOAuthClient`, dev and prod client id switch, wraps `osm-api`, MIT) [measured]; `app/src/modes/parking/map/use-osm-auth.ts` [measured] | `packages/shell/src/auth.ts` [measured] | Compare the PKCE and redirect handling. Do not add the package. Maid's dev client id stays in `apps/maid/.env.local` (AGENTS.md). | S (review) | `osm-api`: MIT (installed copy). Package itself: no licence field | No: Maid has its own, and login belongs to a person's manual test. |
| 13 | Changeset staging and upload ID remap: `packages/osm-changeset/` (`applyUploadResult` remaps negative IDs; `buildChangesetTags` adds `imagery_used`) [measured from README] | `packages/shell/src/save/osm-change.ts`, `packages/shell/src/imagery-used.ts` [measured] | Compare the negative ID remap with Maid's save code. Adopt a missing case only. | S | Package has no licence field, root MIT | Later: compare with a test, adopt only if Maid's remap is missing a case. |
| 14 | Download pending changes as `.osc`: `app/src/utils/download-pending-osc.ts` [measured] | Maid has `packages/shell/src/save/osm-change.ts` and the journal. Maid already writes `.osc` [inferred from file name] | None | - | MIT | No. |
| 15 | Map URL state: `packages/osm-map-url/` (published, MIT) [measured] | Maid's URL and state notes are in `docs/research/state-storage-and-url.md` | Compare. Maid's approach is documented and already in use | S | MIT | No: Maid has its own design. |
| 16 | Route snapper and way chain: `packages/osm-route-snapper/`, `packages/osm-way-chain/` (both published, MIT) [measured] | Maid draws ways itself (`packages/shell/`, `packages/model/`) | Not needed for parking | - | MIT | No: not needed for the parking editor. |
| 17 | Tag editor debounce: `app/src/components/tag-editor/use-debounced-commit.ts` (TanStack Pacer) [measured] | Inspector in `packages/ui/` | Idea only: wait before committing free text | S | MIT | No: Maid already has its own commit flow. |

### Street imagery, surface, bicycle and background

| # | Candidate (monorepo path) | Maid today | How to adopt | Effort | Licence | Recommendation |
|---|---|---|---|---|---|---|
| 18 | Street imagery packages: `packages/street-imagery/` and `packages/street-imagery-react/` (published, both at MIT licence fields; many providers, including StreetView, KartaView, Vegbilder, MVT) [measured] | `packages/module-street-imagery/` uses the same packages, older alphas [measured] | Diff and bump (see top 5, item 3) | S | MIT | **Adopt now** as a version check. |
| 19 | Layer index: `@osm-editor-kit/maplibre-editor-layer-index` (monorepo ^0.1.3, MIT) [measured] | Maid uses 0.2.0 in `packages/module-imagery/package.json` [measured] | None: Maid is newer | - | MIT | No. |
| 20 | Surface mode and smoothness data: `app/src/modes/surface/` (25 files), `@osm-editor-kit/surface-smoothness-data` (licence GPL-3.0-or-later) [measured from installed copy] | `packages/module-surface/` uses the same package. Maid's own research note `docs/research/surface-data-licence.md` already covers the GPL issue [measured] | No new action in this review. The GPL question is open (see Open questions). | - | **GPL-3.0-or-later**: not compatible with Maid's ISC licence for bundled code | Decision needed, not a new adoption. |
| 21 | Bicycle mode: `app/src/modes/bicycle/` (16 files), `@tilda-geo/bicycle-infrastructure` (licence AGPL-3.0-or-later) [measured from installed copy] | Maid's bicycle app is a traffic signs app. Maid does not import the bicycle-infrastructure package [measured by grep] | None | - | **AGPL-3.0-or-later**: do not copy or depend on it | No. |
| 22 | Background atlas boundaries: `app/src/shell/map/atlas-boundaries-paint.ts` uses `tiles.tilda-geo.de` [measured] | Maid's imagery module uses the layer index (`packages/module-imagery/`) | None: a TILDA host, not OSM infrastructure, and not needed | - | Not checked | No. |
| 23 | Panoramax viewer: `@panoramax/web-viewer` (MIT, installed copy) [measured] | Maid references Panoramax in 23 files [measured by grep] | None | - | MIT | No. |

### Width, lanes and measuring (not in Maid)

| # | Candidate (monorepo path) | Maid today | How to adopt | Effort | Licence | Recommendation |
|---|---|---|---|---|---|---|
| 24 | Road width from tags and fallbacks: `app/src/modes/width/domain/road-width-from-tags.ts`, `highway-width-fallbacks.ts`, `width-infra-class.ts`, `width-link-filter.ts`, `handle-geometry.ts` (about 7 files in `domain/`) [measured] | Nothing [measured by grep] | Port the pure logic into a new Maid module, only if a width view is wanted | M | MIT | Later. Needs a scope decision. |
| 25 | Measure guide and cross-section figure: `app/src/modes/width/measure-guide/` (11 files, `sections.ts` with about 30 wiki links, `WidthAuditPage.tsx` with CC BY-SA images) [measured] | Nothing | Take the text idea and write Maid's own text. Do not copy the images (CC BY-SA). | L | Code MIT. Images CC BY-SA 2.0 | Later, text only. |
| 26 | Lane model: `packages/osm-lanes/` (parse and serialise lane tags, pipes, 17 files, about 2200 lines) [measured] | Nothing. Maid's parking is side-based | None for parking. Only if Maid gets a lane editor | L | Private package, root MIT | No, for now. |
| 27 | Lane diagram: `packages/osm-lane-diagram/` (pure layout to SVG, about 10,000 lines including fixtures) [measured] | Nothing | None for parking | L | Private package, root MIT | No, for now. |
| 28 | Lanes audit route and width audit route: `app/src/routes/audit-lanes/`, `audit-width.tsx` [measured] | Nothing | None | - | - | No. |

### Engineering and tooling

| # | Candidate | Maid today | How to adopt | Effort | Licence | Recommendation |
|---|---|---|---|---|---|---|
| 29 | Tests: 47 unit test files in `app/src/test/` (bun test), 116 test files tracked in the repo [measured]. No browser end-to-end test: Playwright appears only as an agent skill folder [measured] | About a dozen browser checks, benchmarks and Vitest suites (AGENTS.md) | Nothing to take for tooling. Use item 2 for test cases | - | MIT | No. Maid is ahead. |
| 30 | Locales: monorepo has `app/messages/en.json` (434 lines) and `de.json`, German default [measured] | Maid has en, de, fr and es (AGENTS.md, `packages/i18n`) | None | - | MIT | No. |
| 31 | Research notes: `research/lane-tags/`, `research/width-measurements/` (sources.md), `research/lane-rendering/` [measured] | Maid's `docs/research/` | Read for ideas. Their sources need a check before reuse | S | Not checked | Later, reference only. |

## What Maid already does better or differently

- **Zero OSM traffic in automation.** Maid's mock API and the policy in `AGENTS.md` keep tests and agents off OSM hosts. The monorepo loads Overpass (`overpass-api.de`, `maps.mail.ru`) and the OSM API from the app [measured].
- **Automation and checks.** Maid has `bun run check`, about a dozen browser checks, `check-all`, a benchmark against iD and Rapid, and a JSON report format. The monorepo has unit tests only [measured].
- **Module architecture.** Maid's parking is a module (`packages/module-parking`) on a core with extension points, so other editors can switch it on. The monorepo is one app with modes [measured].
- **Validation with fixes.** Maid's parking rules come with messages and some fixes (`packages/module-parking/src/validation/`). The monorepo has no validation folder [measured].
- **Languages.** Maid covers four languages. The monorepo covers two [measured].
- **Licences.** Maid is ISC and avoids copyleft in its own packages, apart from the surface data question. The monorepo depends on an AGPL package and a GPL package [measured].
- **Icons.** Maid's parking icons come from the Berlin mapping project with permission and a NOTICE file (`packages/module-parking/README.md`) [measured]. The monorepo's wiki-based images are CC BY-SA and need attribution [inferred].

## Open questions for Tobias

1. May Maid port the MIT `transpose` logic from osm-parking-tag-updater (item 1) into `packages/module-parking`, with a NOTICE entry? The monorepo depends on it from GitHub, not npm, and its package.json has no licence field. The installed LICENSE file is MIT.
2. The surface data is GPL-3.0-or-later and Maid's `module-surface` already imports it. Is the decision in `docs/research/surface-data-licence.md` final? The bicycle package (AGPL) should stay out of Maid.
3. Does Maid want a width view at all (items 24, 25)? That is a scope question, not a porting question.
4. Should Maid's `packages/module-street-imagery` move to the newest published alphas? That needs an npm check, which this review did not make.
5. Does Maid's parking editor need to match the monorepo's side ordering on screen (item 4)? Maid's side rendering was not read in full.
6. A second directory named `street-space-editor` sits next to the monorepo in the same folder. It was not read. Is it another checkout, and does it need the same review?
7. Maid's parking README says nine validation rules. A grep finds ten exported rule constants in `packages/module-parking/src/validation/`. Which is right? (Maid's own docs, not the monorepo.)

## What I could not determine

- Whether the published npm versions of the street imagery packages go beyond Maid's pins (network not used).
- Whether `transpose` covers every old-scheme key, or only the cases its tests show. I read the file headers and types, not the full logic.
- Whether the monorepo's tests pass. I did not run them.
- The licence of the `opening_hours` dependency used by `osm-tag-syntax`.
- Whether Maid's side rendering already uses a screen-based left and right rule.
