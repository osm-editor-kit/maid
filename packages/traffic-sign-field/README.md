# Traffic sign field (`@osm-editor-kit/osm-traffic-sign-field`)

A React field for `traffic_sign` values: the list of signs of a value, with their pictures, a search to add signs and the buttons to reorder and remove them. It has no Maid import: texts and the country come in as props, so the package can move to the osm-traffic-sign-tools repository unchanged. Maid's `trafficSigns` module mounts it as the `trafficSign` field (`packages/module-traffic-signs`).

## What it does

- A row per sign: its picture (loaded per sign), its name (German, from the catalogue), its code in mono, move up and down (or Alt+ArrowUp and Alt+ArrowDown in the row), and remove.
- A sign with a value prompt (such as `274[47]`) has its input in the row. A part the catalogue does not know stays as an "Unknown sign" row and is written back as it was. A named value such as `none` keeps its own row.
- Search under the rows by name, sign id or code. Modifiers (Zusatzzeichen) come through the same search and join the sign before them with a comma. "Never use with this sign" hides signs that the catalogue lists as incompatible. Enter with text that matches nothing adds it as an unknown sign.
- Every change calls `onChange` once with the whole value, `undefined` when no sign is left. One change is one undo step.
- Read-only (no `onChange`, or the feature is read-only): rows only, no search. Several features with different values show "Multiple values".
- The catalogue of one country and the SVG loaders are imported per country, so only the country in use is loaded.

## What the host gives it

Used by `packages/module-traffic-signs` (`src/field.tsx`), which loads the field with `lazy` and passes the country, the texts from Maid's messages and the value. Apps: none directly. The apps that switch on `trafficSigns()` get it: `apps/maid-bicycle` and `apps/maid-lanes`. Tailwind needs `@source '../../traffic-sign-field/src';` in `packages/shell/src/styles.css` (listed there).

## Parts

| Part | What it does |
| --- | --- |
| `src/index.ts` | The exports: the field, the texts, the country helpers, the value helpers, the search |
| `src/TrafficSignField.tsx` | The field: the value's rows, the search, the state and the status line |
| `src/SignRow.tsx`, `src/SignImage.tsx`, `src/use-sign-image.ts` | One sign's row and its picture |
| `src/SignSearch.tsx`, `src/search-catalogue.ts` | The search and its ranking, the ranking of the d3 field |
| `src/sign-value.ts` | Parse and format a `traffic_sign` value over one country's catalogue, without the converter's main entry |
| `src/catalogue.ts` | Lazy loading of one country's data (`@osm-traffic-signs/converter/data/<CC>`) |
| `src/compatibility.ts` | "Never use with this sign" |
| `src/texts.ts` | Every UI string, with English defaults. The host gives its own |

## Tests

`bun test packages/traffic-sign-field`: the parse and format of values (checked against the converter), the search and its ranking, and the search's option list.

## More

- Spec and the d3 field it follows: [docs/research/traffic-sign-field.md](../../docs/research/traffic-sign-field.md).
- The note for the move to osm-traffic-sign-tools: [docs/upstream/traffic-sign-react-field.md](../../docs/upstream/traffic-sign-react-field.md).
- The module that uses it, its presets and its status: [packages/module-traffic-signs/README.md](../module-traffic-signs/README.md).
- Texts for the device: [docs/adr/0012-texts-for-the-device.md](../../docs/adr/0012-texts-for-the-device.md).

Open (from the module README and the steps):

- The tag plan panel ("The traffic sign suggests these tags"), "No sign here" (`none`), the "Open in Traffic Sign Tool" link, drag and drop, and the converter's time restriction normalisation of `opening_hours` prompts. Not built.
- The step "Traffic sign field with `@osm-traffic-signs/id-field`" in the steps is not ticked.
