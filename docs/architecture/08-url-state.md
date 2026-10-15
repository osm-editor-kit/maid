# URL state

Status: decided in outline by Tobias on 2026-10-11 ("we migrate all URLs to nuqs; clean, good URL state is critical"); one live state per setting decided on 2026-10-14 ([url-state-audit.md](../research/url-state-audit.md)). Built.

## Rules

1. **One definition.** Every parameter is a nuqs parser: the shell's own in `packages/shell/src/url/params.ts`, a module's in the module, declared with core's `api.urlParam`. Nothing else reads `location`.
2. **Query string, not hash.** `?map=17/52.52/13.40&id=w123`. nuqs, link previews, analytics and servers all work with the query string; the hash is invisible to half of them.
3. **Typed and validated.** A value that does not parse is treated as absent. It never reaches the app as a string to be interpreted later.
4. **Short and readable.** Names are lower case words with `_`. Values are what a person would type: comma lists, `name:value` lists, slashes. No JSON.
5. **One live state.** The URL is the live state of what it holds. The browser's storage only remembers a person's choice for the next visit. A link never writes storage. Once the editor has started, the URL says what the map shows.
6. **Stable.** A parameter that has shipped keeps its meaning. A rename ships with a rule that reads the old name. Nothing has shipped yet (2026-10-15), so names are still replaced without one.
7. **No code and no configuration through the URL.** No module, no preset file, no style JSON, no API host.

## One hook for a shared setting

A setting that a link can set and a person can choose (brightness, map style, notes, the photo settings, the theme) uses core's `useUrlSetting(handle, { stored, fallback, remember, resolve?, ready?, omitFallback? })` from `@osm-editor-kit/maid-core/react`:

- The value shown is the URL's, else the stored choice, else the fallback (`layered`).
- `choose(value)` is a person's choice: it writes the URL and remembers the value.
- Once `ready`, the URL is kept to what is shown (`urlWrite`). With `omitFallback` the key is left out while the fallback is shown and no link asked for it.
- `resolve` turns a value the editor cannot show (an unknown lens) into what it shows instead, and the URL is corrected.

Live state that is not remembered (the selection, the open photo, a data layer from a link) uses `useUrlParam` directly.

## All parameters

| Maid | iD | What | Written |
| --- | --- | --- | --- |
| `map` | `map` | `zoom/lat/lng`, then turn and tilt when not zero | On move end |
| `id` | `id` | Selected features `n1,w2` (iD's `node/1` is read too), or one note `note/123` | On select |
| `bg` | `background`, `layer` (read only) | The background: an imagery id, `none`, or `custom:<template>` | Always, once started |
| `overlays` | `overlays` | Overlay ids in the order chosen; `none` for none | Always, once started |
| `bg_display` | none | The background's display, `brightness:70`. Later contrast and others join the list | When not at 100 % |
| `offset` | `offset` | Background offset in metres, `east,north` | When not zero |
| `filters` | `disable_features` | Filter states that differ from the editor's, `buildings:readonly,water:hidden`. iD's list is the hidden ones | On change |
| `lens` | none | The map style (lens) by id; `none` for none | Always, once started |
| `notes` | `notes` | `1` when the notes are on | When on |
| `photo_type` | `photo_type` | `flat`, `panoramic`, or both | Always |
| `photo_overlay` | `photo_overlay` | The photo providers on, comma list | When any is on |
| `photo_dates` | `photo_dates` | Date filter `from_to`, each side `YYYY-MM-DD` or empty | When set |
| `photo` | `photo` | The open photo, `provider/id` | While a photo is open |
| `data` | `gpx` | A GeoJSON, GPX or PMTiles address shown as a data layer for the visit | While the layer is shown |
| `lang` | `locale` | The language, one of Maid's (`de-DE` is read as `de`) | On a choice |
| `theme` | `theme` | `light`, `dark` or `system` (no key) | On a choice |
| `comment`, `hashtags`, `source` | the same | Prefill of the changeset, as in iD | Read once at start, then removed |
| `validation_disable`, `validation_warning`, `validation_error` | `validationDisable`, `validationWarning`, `validationError` | Rule levels, comma lists of `type/subtype` with `*` | Never: read at start |
| `api` | none | Data source: `mock`, `osm` or `dev` (core rule 1) | Never |

The modules' rows are declared by the modules (`bg`, `overlays`, `bg_display`, `offset`: imagery; `lens`: lenses; `notes`: notes; `photo_*`: street imagery; `data`: data layers). An app without the module has no such parameter, and an iD link's value for it is dropped and reported.

## iD's URLs

iD keeps state in the hash, and links from osm.org, QA tools and old bookmarks are in that form. `packages/shell/src/url/id-url.ts` is the translation, with tests:

- **`migrateIdHash`** rewrites an iD-style hash to Maid's query parameters in place, with no reload and no extra history entry. It runs twice: before the config is read (the shell's rows) and after the editor is made (the modules' declared iD names).
- **`fromIdUrl`** converts any iD URL and reports what it left out and why.
- **`toIdUrl`** is the way back, for "Open in iD".
- **`ID_URL_RULES`** is the shell's part of the contract; `idRules(declared)` adds the modules' rows.

Left out on purpose, each with its reason in the table:

| iD parameter | Why |
| --- | --- |
| `presets` | Presets are part of the app's configuration (decided by Tobias on 2026-10-15) |
| `maprules` | Validation rules are part of the app's configuration |
| `validationSuggestion` | Maid has no suggestion level, only warnings and errors |
| `walkthrough`, `rtl` | No walkthrough; text direction follows the language |
| `photo_username` | Kept in the URL and passed on to iD; Maid has no user filter for photos yet |
| Anything else | Dropped and reported in the console |

An explicit query parameter wins over the same parameter in the hash.

## Defaults and history

- Parameters of "what is shown" are written out once the editor has started, so a link says what its author saw.
- Every parameter replaces the history entry, as iD does for every hash change.

## Development switches

`scene`, `ui`, `labels`, `fill`, `workers` and the like exist for experiments and the benchmark (`setupParams`). They are read once at start and are not part of the public contract. They will move behind a prefix or a build flag before anything is released.

## Open

- Whether `id` keeps iD's comma list or becomes a repeated parameter.
- `osm-map-url` in osm-editor-kit already parses `map` and a feature parameter for TanStack Router. Either Maid's parsers move there as the router-free core, or that package adopts them. One place, not two.
- osm.org's query form of iD links (`?editor=id&node=1&lat=…&lon=…&zoom=…`, `gpx=<trace id>`) is not read. Noted, not relevant for now (Tobias, 2026-10-15).
