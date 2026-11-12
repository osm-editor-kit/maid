# Street-level images field (`@osm-editor-kit/maid-module-street-imagery`)

The photos module's part for image tags: a "Street-level images" field for `mapillary`, `panoramax` and their keys
(`cycleway:right:mapillary`, `source:traffic_sign:mapillary`, `mapillary:forward`…), and "Use this photo" in the viewer.
The field follows the Radnetz fork (WORKDOC features 19 and 20), without infra3D.

## Using it in an editor's config

```ts
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { streetImagery, streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'

// in the modules list: streetImagery({ mapillaryToken }) already registers the field type
// in the config:
presets: createPresets(withChanges(defaultPresetData, streetImageryPresetChanges)),
```

Changes of several modules chain: `withChanges(withChanges(defaultPresetData, a), b)`. Each change applies to the lists the
presets show after the previous one.

## The field

- One field, id `mapillary` (it replaces the schema's identifier field, as in the fork), universal: "Add field" offers it
  for every feature and it shows once one of its keys has a value.
- A row per image key with a value (keys and labels: `image-keys.ts`). A value is one or more ids separated by `;`, shown as
  chips: the eye opens the photo in the viewer, × removes the id (the last one removes the tag).
- The input under a row adds an id or a link (`https://www.mapillary.com/app/?pKey=…`, `…/map/im/…`; Panoramax
  `#pic=…`). Enter or leaving the input adds it; an id already there is not added twice.
- The select at the bottom adds a row for a key without a value.
- The focused or clicked row is the target of "Use this photo".

## Use this photo

The viewer bar's button adds the open photo to the target key of the selected feature: the row last focused in its field,
if it is a key of the photo's provider; otherwise the provider's default key (`mapillary`, `panoramax`). The id is appended
with `;`. The button is disabled, with the reason as its tooltip, when no feature shows the field or the id is already there.

The field registers its feature with the store while it is shown (`imageWriter`), and the row with `activeImage`. The
viewer cannot know the selection itself: the app keeps it, and the module may not import the app.

## Requests

- Mapillary: one Graph API request per "show" click (`graph.mapillary.com`, `/images?ids=`), with the build's token.
  Nothing is requested on render, nothing in an automated browser (`navigator.webdriver`), nothing without a token.
- Panoramax: no request. "Show" is off for Panoramax ids.

## Viewer, signs and colours

- **Viewer:** the package's `FloatingPhotoViewer` over the map (`viewer.tsx`, a `map.content` item), not the bottom dock
  any more (Tobias, 2026-11-12: the photo did not fit the dock's height and the map took the scroll). It is moved by its
  header, sized at its left edge, minimised, and remembers its place in the browser (`maid:photo-viewer`). Title: the
  provider or "Traffic sign"; the info button opens the package's details dialog; the footer has the date, type and
  author, "Use this photo" and the provider's page.
- **Traffic signs:** iD's layer `mapillary-signs` (in `photo_overlay`), switched under Mapillary in the photos panel and
  independent of the photo layer. Dots from the package (`mapillarySignsAdapter`, vector tiles from zoom 14) with the
  sign's icon above them (`sign-icons.ts`: the SVGs of `@rapideditor/mapillary_sprite_source` from jsDelivr, loaded on
  `styleimagemissing`). Chips filter by the package's sign groups (parking, bike, speed, access, other) with the count in
  view; the date filter applies as in iD (seen within the range). A click selects the sign (`selectedSign`, session
  only): the viewer shows the package's `MapillaryFeatureBar` (a button per capture day), opens the best photo of the
  newest day within the date filter, turns to the sign and outlines it; the map rings it and draws the line from the
  camera (`SelectedMapFeatureLayer`). Three Graph API requests per selected sign (the package's).
- **Colours:** by age (default: newer than 2 years, 2 to 4, older; the package's steps) or by type, stored only
  (`colorBy`). A legend with the count of photos in view. The date slider shows the photos in view as a chart
  (`capturedAt`, from the layers' queries: no request of its own) and its range in the heading.

## URL and start

The photos' URL parameters use iD's names and formats (`url.ts`, `.reference/id/modules/renderer/photos.js`):

All four are declared in `setup` (`PHOTO_PARAM_DECLARATIONS`, `url.ts`) with their iD names and `history: 'replace'`.

- `photo_type`: `flat`, `panoramic` or both (`flat,panoramic`) for the photo kind. Always written, as before.
- `photo_overlay` (the providers on, `none` for none) and `photo_dates` (`from_to`, `_` for no limit): the URL is the live
  state and the stored choice is the default when the URL says nothing. Both leave the key out while the default is
  shown (iD does the same). A choice writes the URL and the store; a link writes the URL only.
- `photo` (the open photo, `provider/id`): live state, not stored. A photo opened or closed (map, viewer, viewer steps)
  is written to the URL; a link's photo opens once its provider is on. Only Mapillary can be opened by id, and only
  outside automated browsers; a Panoramax link's photo stays in the URL and the viewer says it cannot be opened. The photo
  itself is a query (`photo-query.ts`), keyed by provider and id; the store holds no photo, only the writer of the URL.

The writer is `PhotoUrlSync` (`shown.ts`), in the map's content from the start. Readers call `useShownPhotos(false)`
and `useOpenPhoto`, and use what they return; the store's fields are the stored choices, not what is shown. Actions
that open or close a photo, or switch a provider off, write the URL in the same event.
- `photo_username` is not here: Maid has no username filter.

## Gaps

- **Sign in the URL:** the selected sign is not in the URL (iD's Radnetz fork has `photo_sign`); a reload keeps the photo
  only.
- **Sign tagging:** the fork's buttons that write `traffic_sign`, `maxspeed` and `source:traffic_sign:mapillary` from a
  sign are not here yet (research: `docs/research/traffic-signs-mapillary.md`).
- **Selection and undo:** "Use this photo" writes through the field's `onChange`, so the field must be on screen. A feature
  without the field cannot be a target. An `Editor` (or dock props) with the selection and an annotated tag write would make
  this direct, and give the write its own undo annotation.
- **Panoramax by id:** the package reads a Panoramax photo from its sequence; an id alone does not give it. "Show" is off.
- **Numbered keys:** the listed keys are the grammar without numbers (`mapillary:1` etc. are listed only as tags, and show
  when tagged). Years (`mapillary:2019`) and `mapillary:image` are not image keys here.
- **Not done:** thumbnails, the age and the username under each image, the external link per image, the "auto-show on select"
  (fork feature 19 part 2), and the field's row being steady across tag changes (the inspector's `Row.tsx` remounts the field
  when its values change, so focus in the input is lost after an add; adding the type to its steady list would keep it).

## Tests

`bun test packages/module-street-imagery`: the key grammar and labels, the id lists, the link parsing, the target rule and the
plan of "Use this photo", and the photo that "show" builds. The field and the viewer button were rendered on the server only; they
were not seen in a browser.
