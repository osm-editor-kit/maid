# Draft for the surface-smoothness data package: licence (not sent)

Status: local draft, 2026-10-13. Nothing here is sent, posted or opened anywhere. A person decides and does the change in the upstream repository. Maid does not edit, commit, push or comment there (AGENTS.md, rule 3).

Repository: `osm-editor-kit/osm-surface-smoothness-tagging`, directory `packages/data`, published on npm as `@osm-editor-kit/surface-smoothness-data`. Only version 0.0.0 is published (2026-07-27), with `"license": "GPL-3.0-or-later"`. The facts and the sources are in [docs/research/surface-data-licence.md](../research/surface-data-licence.md).

## What the package contains, and what its licence should say

| Part | Origin | Licence today | What to say |
| --- | --- | --- | --- |
| Helper code and types (`dist/index.js`, `dist/types.d.ts`) | the package's authors | GPL-3.0-or-later (whole package) | The team decides: keep GPL, or a permissive licence for these files only. |
| Texts (English titles and matrix descriptions) in `catalogue.json` | StreetComplete `strings.xml` | GPL-3.0-or-later (whole package) | As the team decides for the texts. Maid's owner has a view on them (see the research note, section 5). |
| Structure (which surface takes which smoothness and photo, aliases, the common-surfaces flag) in `catalogue.json` | extracted from StreetComplete by `scripts/extract-from-streetcomplete.ts` | GPL-3.0-or-later | State where it comes from and the StreetComplete commit it was extracted from. |
| 55 photos in `dist/generated/images/` | Wikimedia Commons, OSM wiki, geograph and others, per file | per file in `attribution` | Keep per file. Use SPDX identifiers (see below). |
| 8 vehicle icons in `dist/generated/icons/` | StreetComplete `res/graphics/smoothness` | GPL-3.0-or-later, in `attribution` only (the SVGs carry no licence text) | Say so in a LICENSE or CREDITS file, or in the SVG itself. |

## Changes to propose (each one a decision for the team)

1. **One licence statement per part.** The package's `license` field takes one value. Either keep `GPL-3.0-or-later` for the whole package, or use `"SEE LICENSE IN LICENSE.md"` with a LICENSE.md that lists each part and its licence. Do not write an SPDX expression that implies the whole is one licence when it is not.
2. **Add a LICENSE file to the published tarball.** The 0.0.0 tarball has `"files": ["dist"]` and no LICENSE; add the file and list it in `files`.
3. **SPDX identifiers in `attribution`.** Use `CC-BY-SA-4.0`, `CC-BY-SA-3.0`, `CC-BY-SA-2.0`, `CC-BY-2.0`, `CC-BY-3.0`, `CC0-1.0`, `GPL-3.0-or-later`. "Public Domain" is not an SPDX identifier; use `CC0-1.0` where that is what the uploader released under, or a documented `LicenseRef-` value. The current strings are "CC0", "CC0 1.0", "CC-BY-SA 4.0" and so on, and the team should keep one form.
4. **Fix two attribution gaps** (the team checks each against its source; Maid has not verified them):
   - `images/surface_unpaved_impassable.jpg`: the only source is a Google Drive link (`attribution` line 690-692), with "Public Domain". Replace it with a stable source, or record who released it and under what licence.
   - `images/surface_paving_stones.jpg`: "Tobias Zwick with modifications by Mateusz Konieczny", "CC0 1.0" (line 600-606), no URL. Add the URL of the original and say what the modification was.
5. **Record the StreetComplete commit.** `meta` (lines 3-13) names StreetComplete but not the commit the extract ran on. Add it, so that the texts and the structure can be traced.
6. **README.** It names `dist/catalogue.min.json` (the file is `dist/generated/catalogue.json`), says "Status: scaffold only", and links to a `WORK_PLAN.md` outside the package. Replace the stale parts, and add a Licence section that says what is in section 1 above.
7. **Version.** Publish a new version with the licence change, rather than changing 0.0.0 in place. The current npm `latest` is 0.0.0, GPL-3.0-or-later. Nothing should be unpublished.

## What Maid needs back from the team

- Whether the licence was changed in the GitHub repository and not yet published (Maid saw only 0.0.0 on npm). The note on Maid's side says that this could not be checked from here.
- The licence for each part, in the form the team picks (items 1 and 3 above). Maid then applies one of options A to D in the research note, in its own repository.
- A version number to depend on, once published. Maid's `packages/module-surface/package.json` pins `"0.0.0"` today.
