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

## Gaps

- **Dock tab:** "show" puts the photo in the dock's viewer, but does not open the dock's Photos tab: the dock keeps its tab
  to itself and offers no API for it.
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
