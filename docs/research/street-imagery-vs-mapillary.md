# Street-level photos: Maid against Mapillary and iD

Status: written from the code, not from a browser. The module is switched off in automated browsers (`navigator.webdriver`), so none of the claims about Maid's behaviour were seen running. Claims about the Mapillary web app come from memory and are marked "unverified". iD references are to `.reference/id` (read only).

Effort: S = wiring what a package already exports, or a link/button from data the module has. M = a few files or a package-level change. L = a new UI area or a package change of its own.

## Comparison

| Feature | Mapillary / iD | Maid today | In the packages, not wired (export) | Effort | Needs | Panoramax |
| --- | --- | --- | --- | --- | --- | --- |
| Sequence lines | Mapillary draws sequences as lines. iD draws them from zoom 12 (`.reference/id/modules/svg/mapillary_images.js`) | Done: the package draws them. `showSequences` defaults to true and the module does not change it | `showSequences` option | S (done) | nothing | Same layer, if the adapter has `fetchSequences` (unchecked) |
| Photo points and from which zoom | iD: photos from 12, markers from 16, view cones from 18 (`mapillary_images.js`) | Done: photos from zoom 13 (`MIN_ZOOM` in `src/map.tsx`), via `minZoom` | `minZoom` option | S (done) | nothing | Yes |
| Colour by age | Unverified whether the Mapillary web app offers it. iD has the age slider, not colour by age | Not done: colour by type only (`photoTypeColorExpression`) | `ageStepColorExpression`, `createAgeSteps`, `AGE_STEP_COLORS` (street-imagery `map/ageSteps`) | S, needs a colour choice | a stored `colorBy` value and a choice group in the panel | Yes (uses `capturedAt`) |
| Colour by type | Unverified for Mapillary. iD: not checked in the code read | Done: `photoTypeColorExpression` | | S (done) | nothing | Yes |
| Date range filter | iD: age slider with "from" and "to" (`.reference/id/modules/ui/sections/photo_overlays.js`, lines 208 to 348). Mapillary: date range (unverified) | Done: `PhotoDateRangeFilter` on `filter.date`, stored | | S (done) | nothing | Yes |
| Photo type filter (flat, 360°) | iD: photo type checkboxes (`photo_overlays.js`, lines 142 to 206). Mapillary: image type (unverified) | Done: All, Flat, 360° as one radio group (`src/panel.tsx`) | `PhotoFilter.photoTypes` (used) | S (done) | nothing | Yes |
| Filter by user name | iD: username filter (`photo_overlays.js`, lines 366 to 427). Mapillary: unverified | Not done | None: `PhotoFilter` has no creator field | M to L | a package change, or a filter of the photo list the layers draw from | No username filter in the packages |
| Filter by organisation | Not found in the iD code read. Mapillary: unverified | Not done | None | L | a package change | No |
| View cone of the open photo, and its bearing while panning a 360° photo | iD: view fields from zoom 18. Mapillary: yes | Done: `showViewCone` and `viewerPov` (bearing, hfov, lngLat) from the viewer | `StreetLevelImageryViewCone` (used) | S (done) | nothing; not seen in a browser | Yes |
| Next and previous in the sequence | Mapillary and iD: arrows in the viewer | Done: the arrows of the package's viewer (`MapillaryPanel`, mapillary-js) | `groupPhotos` prop (passed as `[]`) | S (done) | nothing; not seen in a browser | Steps along the sequence work. Arrows to nearby pictures do not (package README) |
| Keyboard in the viewer | Mapillary: arrow keys (unverified). iD: viewer keys | Viewer's own keys (mapillary-js), not checked | | S (done, unchecked) | a check in a browser by a person | Same engine |
| Photo details: date, user, camera, exact position, compass | Mapillary: details panel. iD: the viewer's info | Done now: "Details" button opens `PhotoDetailsDialog` | `PhotoDetailsDialog`, `PHOTO_DETAILS_LABELS` (`/photo-details`) | S (added now) | nothing | Yes, the dialog takes both providers |
| Link to open the photo on the provider's site | Mapillary: yes. iD: links to Mapillary | Done now: "Open on Mapillary" or "Open on Panoramax" in the dock, also the dialog's photo id link | `providerExternalLink` (street-imagery `viewer/externalLinks`) | S (added now) | nothing: a link opened by a click, no request | Yes |
| Copy the photo id, or set `mapillary=*` on the selected feature | iD: `mapillary` tag fields in presets (unverified here) | Not done | None | M | a tag write through `editor.history`: one undo step, on the selected feature only | Panoramax: `panoramax=*` tag, unverified |
| Traffic signs and map features as layers | Mapillary: signs and map objects. iD: `mapillary_signs.js`, `mapillary_map_features.js`, from zoom 14 (`services/mapillary.js`) | Partly: map features are drawn as dots by the package's `ProviderLayer`. Dots are not clickable as features (`streetImageryClick` takes photos only). No value filter | `PhotoFilter.mapFeatureValue`, `matchesAnyGroup`, `signGroupFilter`, `MapillaryFeatureBar` | S for a group filter, M for a clickable feature | a group choice in the panel; a click handler for `mapFeature` hits | No map features |
| Detections (sign outlines) in the viewer | Mapillary: outlines in the image. iD: "Show traffic sign detections in image viewer" (`services/mapillary.js`) | Not done | `outlines` prop of `StreetLevelImageryViewer`, `useMapillaryImageDetections` | M | a query per photo and a filter | No |
| Highlight photos near the selected feature | iD: photos for a sign (unverified in detail) | Not done | `SelectedMapFeatureLayer`, `useSelectedMapillaryFeature`, `useMapillaryMapFeaturesNear` | M to L | the OSM selection of Maid as an input; Mapillary map features only | No |
| Viewer size and placement (dock or floating, resizable) | Mapillary: floating viewer (unverified). iD: side panel | Dock view only, via the module's `DockView` | `FloatingPhotoViewer`, `ViewpointLayer`, `getViewpointSession` (viewpoints) | L | a viewpoint session and a floating layout in the UI shell | Yes |
| Attribution | Mapillary: image credit. Panoramax: creator and licence | Done: the Panoramax panel shows creator and licence; the Mapillary viewer shows its own | `hideAttribution` (not set) | S (done) | nothing | Yes |
| Keeping the open photo in the URL | iD: unverified | Not done. Maid has URL state in `apps/maid/src/url/params.ts` | Store `openPhoto` (`src/store.ts`) | M | a URL parameter, restored before the photo is requested | Yes |

## Counts

- Rows: 20.
- Done before this change: 9 (sequence lines, photo points, colour by type, date range, photo type, view cone, next and previous, keyboard (unchecked), attribution).
- Added now: 2 (photo details, link to the provider's site).
- Easy but not done: 2 (colour by age, a group filter for map features).
- Larger, by name: user name filter, organisation filter, copy photo id or tag, detections in the viewer, highlight near the selected feature, floating or resizable viewer, photo in the URL.

## Added now

- Photo details: a "Details" button in the dock's header opens `PhotoDetailsDialog` (`@osm-editor-kit/street-imagery-react/photo-details`) for the open photo (`src/dock.tsx`). The dialog's photo id links to the provider.
- Link to the photo's page on the provider's site: "Open on Mapillary" or "Open on Panoramax" in the dock's header, from `providerExternalLink` through `photoPageLink` (`src/links.ts`, tested in `src/links.test.ts`). It opens in a new tab on a click. The module makes no request to it.

## Dark mode

Cause: the package has no `dark:` variant in any of its built files (count of `dark:` in `dist/*.js`: 0). "Exact data" in the bug report is the "Exact dates" summary of `PhotoDateRangeFilter`, which had `hover:text-slate-900`: near black on the dark panel.

Light-only classes in the package (by file, `@osm-editor-kit/street-imagery-react/dist`):

Used by the module now:
- `index.js`, `PhotoDateRangeFilter`: `summary` hover `hover:text-slate-900` (Exact dates). `details` `text-slate-600`. The "All dates" link `text-slate-600 hover:text-slate-900`. Year buttons `text-slate-500 hover:text-slate-900`. The range label `text-slate-700`. The date inputs `border-slate-200 text-slate-800` with no background (white). Chart bars `bg-slate-500`, `bg-slate-300`. Track `bg-slate-200`, selection `bg-slate-700`. Slider thumb `bg-slate-800`.
- `index.js`, `ViewerPanelPlaceholder`: `bg-slate-100 border-slate-200` while the viewer loads.
- `chunk-SGIB7AVC.js` (Mapillary) and `chunk-XQXYV6SR.js` (Panoramax): viewer frame `border-slate-200 bg-slate-900`. Attribution `hover:underline` is fine in both themes.
- `photo-details.js` (used now): dialog `bg-white ring-zinc-950/10`, `text-zinc-950`, `text-zinc-500`, `border-zinc-950/5`, close button `hover:bg-zinc-950/5 hover:text-zinc-950`, links `decoration-zinc-950/30 hover:decoration-zinc-950`, EXIF `summary hover:text-zinc-950`.

Not used by the module (the same kind of classes, for later): `FloatingPhotoViewer` toolbar `hover:bg-slate-100 hover:text-slate-900`, suggestion chips `bg-white text-slate-800 ring-slate-200 hover:bg-slate-50`, `text-slate-400`; `MapillaryFeatureBar` chips `border-slate-300 bg-white text-slate-700 hover:border-slate-400`; resize handle `hover:bg-fuchsia-500/20`; `ViewpointLayer` labels.

What the module does: `src/street-imagery.css`, imported by `src/panel.tsx`, with rules under `.dark .maid-street-imagery` only. The wrapper class is on the panel's root and on the dock's open-photo root. Each rule names the light class it corrects. Light mode is untouched.

Draft request for the package (not sent; for a person to decide): add `dark:` variants to the components above, with the same mapping that `street-imagery.css` uses: slate-500 to 600 text to zinc-400, slate-700 to zinc-200, hover slate-900 to white, bg-slate-200 track to zinc-700, date inputs with a dark background and `color-scheme: dark`, and the photo details dialog with a dark surface. Or a `className`/`theme` prop on the components.

## What the app must wire

- Nothing new in Maid's `apps/maid/src/index.css`. Its `@source` lines for `module-street-imagery/src` and for the package's `dist` are already there.
- The module imports its own CSS (`street-imagery.css`) from `panel.tsx`. The bundle gains `@osm-editor-kit/street-imagery-react/photo-details` (the dialog's chunk), which the package keeps out of apps that do not import it.
- No new network host. Mapillary and Panoramax are the providers the module already reads from. The provider links open a page only on a click.

## Not seen in a browser

- Every dark-mode change: the module is off in automated browsers. A person should open the photos panel and the dock with Mapillary on, in dark mode, and check the date filter's hover and the photo-type group.
- The keyboard in the viewer and the arrows in the sequence.
- Whether the photo details dialog's fields are filled for Mapillary and Panoramax.
- The Mapillary web app's features marked "unverified" above. They were not checked against the live app, by design (no requests to OSM infrastructure from an agent session).

## Sources

- `packages/module-street-imagery/node_modules/@osm-editor-kit/street-imagery-react/` (README and `dist/`, read only)
- `packages/module-street-imagery/node_modules/@osm-editor-kit/street-imagery/dist/` (exports: `viewer/externalLinks`, `map/ageSteps`, `providers/model`)
- `.reference/id/modules/svg/mapillary_images.js`, `.reference/id/modules/ui/sections/photo_overlays.js`, `.reference/id/modules/services/mapillary.js`
