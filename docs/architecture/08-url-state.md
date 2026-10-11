# URL state

Status: decided in outline by Tobias on 2026-10-11 ("we migrate all URLs to nuqs; clean, good URL state is critical"). The first part is built.

## Rules

1. **One definition.** Every parameter is a nuqs parser in one place (`apps/maid/src/url/params.ts` today). Nothing else reads `location`.
2. **Query string, not hash.** `?map=17/52.52/13.40&id=w123`. nuqs, link previews, analytics and servers all work with the query string; the hash is invisible to half of them.
3. **Typed and validated.** A value that does not parse is treated as absent. It never reaches the app as a string to be interpreted later.
4. **Short and readable.** Names are words. Values are what a person would type. Nothing is encoded that does not have to be.
5. **Only state that is worth sharing.** The URL describes what you are looking at, not how your editor is set up. See the split below.
6. **Stable.** A parameter that has shipped keeps its meaning. A rename ships with a rule that reads the old name.
7. **No code and no configuration through the URL.** No module, no preset file, no style JSON, no API host.

## What is in the URL

| Group | Parameters | Written when |
| --- | --- | --- |
| View | `map` (zoom/lat/lng, iD's order) | On move end, replacing the history entry |
| Selection | `id` (`w123`, later a list) | On select, replacing |
| What is shown | `background`, `overlays`, `filters`, `lens`, `photo…` | On change |
| Hand-over from other tools | `comment`, `hashtags`, `source` | Read once at start, then removed from the URL |
| Declared by a module | for example `maproulette`, `way_table` | As the module defines |

Not in the URL: theme, language, panel sizes, toolbar options, last used presets. Those are settings ([storage and settings](09-storage-and-settings.md)). The exception is deliberate hand-over, for example `locale` from osm.org, which is read once.

### Defaults

nuqs removes a parameter from the URL when it equals its default. That keeps URLs short, and it means a shared link changes meaning if the default changes. Rule: **parameters of "what is shown" are always written out** (`clearOnDefault: false`) when they were set by the user, so a link says what its author saw.

### History

View and selection replace the current history entry. Opening a pane or a task pushes one, so Back closes it. Each parameter states which it does, in its definition.

## iD's URLs

iD keeps state in the hash, and links from osm.org, QA tools and old bookmarks are in that form. `apps/maid/src/url/id-url.ts` is the translation, with tests:

- **`migrateIdHash`** runs once before the app renders. An iD-style hash is rewritten to Maid's query parameters in place, with no reload and no extra history entry.
- **`fromIdUrl`** converts any iD URL and reports what it left out and why.
- **`toIdUrl`** is the way back, for "Open in iD".
- **`ID_URL_RULES`** is the contract: one row per iD parameter.

| iD parameter | In Maid |
| --- | --- |
| `map`, `id` | The same, in use |
| `background`, `overlays`, `offset`, `disable_features`, `comment`, `hashtags`, `source`, `locale`, `gpx`, `photo`, `photo_overlay`, `photo_dates`, `photo_username` | Carried over under the same name. Maid does not act on them yet; they survive a round trip and start working when the feature arrives |
| `presets`, `maprules` | Dropped: presets and validation rules are part of the build configuration |
| `walkthrough`, `rtl` | Dropped: no walkthrough; text direction follows the language |
| Anything else | Dropped and reported in the console |

An explicit query parameter wins over the same parameter in the hash.

When a carried parameter gets its feature, its row changes from "carried" to a real mapping, possibly with a new name and a value conversion (`disable_features=a,b` becomes `filters=a:hidden,b:hidden`).

## Development switches

`scene`, `update`, `fill`, `workers` and the like exist for experiments and the benchmark. They are defined with the same parsers, in their own group (`setupParams`), read once at start, and are not part of the public contract. They will move behind a prefix or a build flag before anything is released.

## Open

- The final names and value formats for `filters`, `lens`, `background` and the photo parameters. Worth an hour of care each: they are forever.
- Whether `id` keeps iD's comma list or becomes a repeated parameter.
- `osm-map-url` in osm-editor-kit already parses `map` and a feature parameter for TanStack Router. Either Maid's parsers move there as the router-free core, or that package adopts them. One place, not two.
