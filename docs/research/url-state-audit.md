# URL state audit: what is shared, where it lives, and what goes into the URL

Status: research, 2026-10-14. Read-only audit. Nothing was run: no tests, no browser, no dev server.
Sources are the code in this checkout, iD in `.reference/id` (pinned, read only), the nuqs docs at nuqs.dev, and the installed nuqs 2.10.1 source. Each claim is marked as read, verified, or inferred in section 7.

The rule for this audit comes from Tobias: there must never be two live states of one thing. Shared state (what is shown on the map and how) has one source of truth, the URL through nuqs. Browser storage may keep a remembered default for the next visit, but must not drift from the URL.

## 0. Summary

- 46 states were found (section 2). Each is one row. Some rows are derived copies of another row.
- The background bug is confirmed by code. `packages/module-imagery` never reads or writes the URL. The only URL reader is `customBackgroundLink` (`packages/shell/src/url/background.ts`), which copies a `background=custom:` value once into the store's `visit` field and never updates it.
- Live copies that drift today (section 2b):
  - Selection: the URL `id` is written in one place only. The engine changes the selection in five other places, and none of them writes the URL.
  - Language: a `lang` URL value is read outside `params.ts` and wins over the stored choice on every load.
  - Data server: a URL `api` value wins over the stored server and can point a deployed build at the real OSM API. This also conflicts with rule 7 of `docs/architecture/08-url-state.md` ("no API host through the URL").
- The fix for background is: `background` and `overlays` in iD's notation, read and written by the module through a small core API, with the stored choice as the default when the URL is silent (section 3).

## 1. The rule and the nuqs practices that apply

### 1.1 The rule, as it applies here

| Rule | What it means in Maid |
| --- | --- |
| One source for shared state | A value a person would expect to survive a reload or a shared link is written to the URL. The stored value is a default for the next visit, never a second live copy. |
| URL wins | When the URL has a value, it is shown. Storage is not written by a link alone. |
| Stored choice is the default | When the URL is silent, the person's stored choice is shown. A change by the person writes the URL and the stored choice (ADR 0009, rules 2 and 3). |
| Config default is the last layer | Fork config, then Maid's own default (`docs/architecture/09-storage-and-settings.md`, "Which value wins"). |
| Same names and notation where iD has them | Use iD's parameter names and value formats when iD has them (ADR 0009: "when in doubt, follow iD"). |
| Not in the URL | Theme, panel sizes, favourites, recents, unsaved edits, sign-in, caches (`docs/architecture/08-url-state.md`, "What is in the URL"). |

### 1.2 nuqs practices and what they mean here

| nuqs practice | What the docs or source say (verified) | What it means for Maid |
| --- | --- | --- |
| One parser per parameter, in one place | `createParser` takes `parse` (returns `null` when invalid), `serialize`, and an optional `eq`. `eq` is used by `clearOnDefault`. (docs, custom parsers page) | Already done in `packages/shell/src/url/params.ts`. Keep it. New modules need the same single place (section 3.4). |
| `history` | Default `replace`. `push` adds a history entry per change and can break Back (docs, options). | Keep `replace` for `map`, `id`, `filters`, `background`, `overlays`, all of them. iD also uses `replaceState` for every hash change (`behavior/hash.js`, `patchHash`). Use `push` only for an opened pane that Back should close. Nothing needs it yet. |
| `throttleMs` is deprecated | Deprecated since nuqs 2.5.0. Replace with `limitUrlUpdates: throttle(ms)` (docs, options). | `packages/shell/src/url/state.ts` still uses `throttleMs: 300` on `map`. Change to `limitUrlUpdates: throttle(300)`. Caveat from the docs: when several hooks set different values in one tick, the highest rate wins, and values under 50 ms are ignored. |
| `clearOnDefault` | Default `true` since nuqs 2.0. A value equal to the default is removed from the URL. Set `false` to keep it visible (docs, options). | For "what is shown" parameters, set `clearOnDefault: false`, so a link says what its author saw (`08-url-state.md`, "Defaults"). Only when a parser has a default. |
| `null` means absent | `null` removes the key. The docs do not state a general rule for `null` from `parse`. | Use no default for layered settings. Absent (`null`) means "the URL has no opinion", so the stored choice applies. Do not use `withDefault` for background, overlays or lens, or the URL can never say "the default". |
| Explicit values | With `clearOnDefault: false` a value at the default stays in the URL. | A person's choice is written out even when it equals the default, so the link does not change meaning when the default changes. |
| Batching | Setter calls in one tick are merged and written once. The React state updates at once. `useQueryStates` updates keys together (docs, batching and options). | Use `useQueryStates` for keys that change together (for example `background` and `overlays` when a custom background is saved). |
| Adapter | `NuqsAdapter` from `nuqs/adapters/react` wraps the app once. No other setup is needed in an SPA (docs, adapters). | Already in `packages/shell/src/App.tsx` and `sheet-harness.tsx`. A module component works under it. |
| popstate | Verified in nuqs 2.10.1 (`dist`, react adapter subscribe): nuqs listens to `popstate` and re-reads the URL, so hook values follow Back and Forward. | Maid's engine and map do not follow. Nothing in `packages/` or `apps/` listens to `popstate`. This does not matter while every write is `replace`, but it is a bug the day a `push` is added (section 2b, D1). |
| Shallow | Default `true`. With no server, `shallow: false` has no effect (docs, options and adapters). | Keep the default. |
| Serialize loses precision | If `serialize` rounds, the state is lost on reload (docs, custom parsers). | `parseAsCamera` rounds the position. Its test should prove a round trip at each zoom (section 4, S-1). |
| `parseServerSide` | Not in the docs we could read. `readParams` in `params.ts` relies on it for the start values. | Keep, but cite the source when it is relied on. |

Docs pages that returned 404 and were not read: `/docs/utils`, `/docs/faq`, `/docs/use-query-states`. Their content is covered above from the other pages and from the source.

## 2. The state table

Columns: where the state lives now; whether it has a second live copy; whether iD puts it in the URL (iD name); recommendation.

"Stored" means zustand `persist` or localStorage through `moduleStorage()`. "Session" means memory only.

### Group A: map and selection

| # | State | Lives now | Second copy | iD URL | Recommendation |
| --- | --- | --- | --- | --- | --- |
| S01 | Map position | URL `map`, written on each move end (`MapView.tsx` `handleMoveEnd`, through `setCameraParam`). Read at start (`startCamera`, `cameraParam ?? config.camera`). | MapLibre camera (the engine). Not a drift: the URL is written from it. The start value is read twice (`config.camera` and `cameraParam`). | `map` (`zoom/lat/lng`, 2 decimals on zoom) | **URL.** Keep. Read it once. Maid adds a 4th part (turn) and a 5th (tilt) that iD does not have. |
| S02 | Last map position | Stored `settings.lastView` (`packages/ui/src/settings.ts`). Used only when the URL has no `map`. | Yes, but as a fallback only, which is correct. | `map-location` pref (`behavior/hash.js`) | **Storage** as the remembered default. Keep as it is. |
| S03 | Selection | URL `id`, written only by `useSelection().select` (`packages/shell/src/selection.ts`). | Engine selection (`engine.setSelected`). Two live copies, and they drift (D1). | `id`: comma list, or `note/<id>` | **URL is the source.** One writer (section 4, S-2). |
| S04 | Selection-only view | Engine (`selectionOnlyShown`). Per visit. | None. | None | **Session.** As ADR 0009 says ("per visit, not stored"). |
| S05 | Mode, measuring, hover, zoom guard, context menu, cursor, drawing state | Engine and React state in `MapView.tsx` | None | None | **Session.** |
| S06 | Map turn (bearing) mirror | `useBearingStore` (`packages/ui/src/bearing.ts`), set from the map in `MapView`. | A copy of the map's bearing. Derived. | None (iD has no rotation) | **Derived.** Read it from the camera, or keep it as a mirror with one writer. |
| S07 | Map viewport for the imagery panel | `view` in the imagery store, set by the map layer. | A copy of the map bounds. Derived. | None | **Session, derived.** |
| S08 | Filters (editable, read-only, hidden) | URL `filters` (e.g. `buildings:readonly`), written on change (`FilterButton.tsx`, `useFiltersParam`). Read at start (`config.ts` `readFilters`). | Three: URL, stored copy (S09), engine `FilterSet`. | `disable_features` (hidden only), read on start (`features.js` `init`) | **URL.** Keep. The iD name is read and mapped on start (done). |
| S09 | Filters, stored copy | `settings.shown.filters` (`useStoredShown('filters')`). Written with the URL on each change. | Yes, paired with S08. Used as the remembered default. | Not in iD (iD keeps `disabled-features` pref as the same idea) | **Storage** as the remembered default, per the rule. The paired write is right; the banner logic that reads both is not (D3). |
| S10 | Background choice | Stored `maid:imagery.backgroundId` (`packages/module-imagery/src/imagery-store.ts`). ELI id or `custom-N`. URL: nothing. | None, but the URL is missing. | `background` (ELI id, `none`, or `custom:<template>`), written on each change (`background.js` `updateImagery`) | **URL**, with the stored choice as the default (section 3). This is the reported bug. |
| S11 | Background from a link | `visit` in the imagery store. Set once from `customBackgroundLink(location.search)` (`packages/shell/src/url/background.ts`) through `useBackgroundLink` in `App.tsx`. | A copy of a URL value that is never updated. Stale after any change until the next `visit` clear. | `background=custom:` (same as S10) | **Remove `visit`.** The URL is the value. Read it through the registry (section 3.4). |
| S12 | Custom background list | Stored `custom` and `customNext` (`imagery-store.ts`, `custom.ts`). Entries `{id: "custom-N", name, template}`. | The template is also the URL value (S10 via S11). Two notations for one background. | iD has one template only (pref `background-custom-template`, `background.js`) | **Storage** for the list of names. Key each entry by its template, so the URL and storage use the same notation (section 3.2). `customNext` and `custom-N` ids go away. |
| S13 | Overlays (on or off, order) | Stored `overlayIds` only. Order is the order chosen. | None. The URL is missing. | `overlays`, comma list, in the order chosen; written only when non-empty (`background.js`) | **URL** (`overlays`, iD order), stored choice as the default. An empty list must be written as an explicit value (section 3.2). |
| S14 | Brightness of imagery | Stored `brightness` (`imagery-store.ts`). | None. | Not in the URL. iD keeps it in the pref `background-opacity` (`background_display_options.js`). | **Storage only**, as iD does. Open question Q2. |
| S15 | Background offset | Not built in Maid. | None. | `offset` (`x,y` in metres, written when not zero) | **Carried** in `ID_URL_RULES` until the feature exists. Then a URL writer. |
| S16 | Active lens | Stored `maid:lenses.activeId` (`packages/module-lenses/src/lens-store.ts`). | None. | None. `docs/architecture/08-url-state.md` lists `lens` under "What is shown". | **URL** `lens=<id>` (the name only, never the style: `07-styles-and-lenses.md` line 64). Stored choice as the default. |
| S17 | Imported lenses (lens files) | Stored `imported` (zod-checked). | None. | None | **Storage.** A link naming an imported lens falls back to none on a browser that does not have it. |
| S18 | Parking sides shown, gap check | Zustand session (`packages/module-parking/src/lens/side-state.ts`), derived from the active lens. | Derived from S16. | None | **Derived.** No state of its own. |
| S19 | Data layers added (URL-pasted layers) | Stored `maid:data-layers.added` (`packages/module-data-layers/src/data-layers-store.ts`). | None. | `gpx` (a data layer URL, read once, `background.js` `init`) | **Storage.** Do not put remote data URLs in a link (section 5, Q8). |
| S20 | Data layers hidden | Stored `hidden`. | None. | None | **Storage.** |
| S21 | Data layer files | Session `files`. | None. | None | **Session.** |
| S22 | Notes shown | Stored `maid:notes.enabled` (`packages/module-notes/src/store.ts`). | None. | `notes` (read once, `svg/notes.js`) | **URL** `notes=1` (iD's name) with the stored choice as the default. Caveat: a link that turns notes on makes the viewer's browser call the OSM notes API. Open question Q8. |
| S23 | Notes: show closed | Stored `showClosed`. | None. | None | **Storage.** |
| S24 | Notes: chosen note, focus, view, notice | Session (`useNotesSession`, `packages/module-notes/src/store.ts`). | None. | `id=note/<id>` | **Session.** But `id` must accept `note/<id>` (S03 fix). |
| S25 | Photo layers on (providers) | Stored `providers` (`packages/module-street-imagery/src/street-imagery-store.ts`). | None. | `photo_overlay`, comma list (`photos.js` `updateStorage`) | **URL** `photo_overlay` (iD name) with the stored choice as the default. |
| S26 | Photo kind | Stored `photoKind`. | None. | `photo_type` | **URL** `photo_type` with the stored default. |
| S27 | Photo date range | Stored `date`. | None. | `photo_dates` (`2019-01-01_2020-12-31`) | **URL** `photo_dates` with the stored default. |
| S28 | Open photo | Session `openPhoto`. | None. | `photo=<service>/<key>` (`mapillary.js`, `streetside.js`, `panoramax.js`; cleared on close) | **URL** `photo` (the id only), with a question (Q7). |
| S29 | Photo session objects: `easeTo`, `imageWriter`, `activeImage`; Mapillary token | Session; token from the build (`mapillaryToken`). | None. | None | **Session.** The token is build configuration, never stored or in the URL. |
| S30 | Theme | Stored `settings.theme` (`packages/ui/src/settings.ts`), applied to the document (`packages/ui/src/theme.ts`). | None. | `theme` (URL, read on start and on hash change, `context.ts` and `hash.js`) | **Storage** (Q6). Maid drops iD's `theme` on read (`id-url.ts`, "unknown to Maid"). |
| S31 | Language | Stored `settings.lang`. No caller of `setLang` was found outside `settings.ts`, so the UI cannot set it yet (read). The URL `lang` is read in `packages/shell/src/mount.tsx` through `chooseLocale(location.href)` (`packages/i18n/src/choose.ts`). It is not in `params.ts`. | Two copies. The URL wins on every load (D4). | `locale` (iD's name). Maid's own name is `lang`. | **URL** `lang` in `params.ts` (`parseAsStringLiteral` over the four locales), with the stored choice as the default. Map iD's `locale` to it. |
| S32 | Data server (mock, OSM, development) | URL `api` (setup parameter, read once, `config.ts` `chooseSource`), and stored `settings.server` (read only in a deployed build). | Two copies. The URL wins for the session and can choose the real OSM API in a deployed build (D5). | None. | **Not in the public URL** (Q5). Conflicts with `08-url-state.md` rule 7. |
| S33 | Setup switches: `scene`, `ui`, `labels`, `icons`, `pins`, `fill`, `workers`, `minDataZoom`, `tolerance`, `sourceMaxZoom`, `fade`, `loupe` | URL, read once (`setupParams`). Not persisted. | None. | `fill` is `area-fill`, a pref in iD (`renderer/map.js`), not a URL parameter. | **Dev and bench** for most. Move display choices (`fill`, and maybe `labels`, `icons`, `pins`) to storage (Q9). |
| S34 | Panel sizes | Stored `settings.sizes` (`useResizable`, keys `sidebar-width` and `dock-height`). | None. | None | **Storage.** |
| S35 | Favourite presets and their numbers | Stored `settings.favourites` (`packages/shell/src/favourites.ts`). | None. | None (iD has no favourites) | **Storage.** |
| S36 | Recent presets | Stored `maid:recents` (`packages/ui/src/inspector/recents.ts`). Not recorded under automation. | None. | `preset_recents` pref | **Storage.** |
| S37 | Dock open and selected tab | React `useState` in `packages/ui/src/Dock.tsx`. Not stored. | None. | Panel states are prefs (`disclosure.<key>.expanded`) | **Storage** as a visitor convenience (not URL). Low value; optional. |
| S38 | Phone sheet open | React state in `Shell.tsx` and a mirror in `App.tsx` (`useState({open, selection: param})`, reset when the selection changes). | A mirror of S03. | None | **Session, derived** from the selection. The mirror is fine as derived state. |
| S39 | Search flyout open, search text, focus counter | Zustand session (`packages/shell/src/search/flyout.ts`), `SearchButton.tsx` React state. | None. | None | **Session.** |
| S40 | Changeset comment, source, hashtags | React state in `SaveButton.tsx` (session). URL `comment`, `source`, `hashtags`: carried by `migrateIdHash`, and they stay in the URL. Nothing reads them. | Not live, but the URL keeps values nobody reads. | `comment`, `source`, `hashtags`. Read once on start and removed from the hash (`context.ts`, `hash.js` `computeHashUpdate`). | **Hand-over.** Read once into the save form, then remove from the URL, as `08-url-state.md` says. The code does not remove them today. |

### Group D: edits and sessions

| # | State | Lives now | Second copy | iD URL | Recommendation |
| --- | --- | --- | --- | --- | --- |
| S41 | Unsaved edits and undo history | IndexedDB journal (Dexie, `packages/journal/src/journal.ts`, used by `packages/shell/src/journal.ts`). | None. | None (iD also uses IndexedDB) | **Storage**, not URL. Keep. The restored `id` depends on S03. |
| S42 | Ignored validation issues | Stored `maid:validation-ignored` (`packages/shell/src/modules/validation-ignored.ts`). Cleared with the edits. | None. | `validationDisable` and the `validation*` severity parameters, pref-based in iD | **Storage**, tied to the journal. Keep. |
| S43 | Relations touched in this session | Session (`packages/shell/src/modules/relations-session-store.ts`). | None. | None | **Session.** |
| S44 | Stack picker and the new feature id | Session (`stack.ts`, `new-feature.ts`). | None. | None | **Session.** |
| S45 | Sign-in token and display name | localStorage (`packages/shell/src/auth.ts` keys, and `__osmAuth` from osm-api). | None. | None | **Storage**, never a URL parameter. Login is off under automation. |
| S46 | Wiki and reference answers (30 days) | localStorage (`packages/shell/src/components/reference.ts`). A cache. | None. | None | **Storage cache.** Keep. |

Count: 46 rows (S01 to S46). Rows S06, S07, S18, S38 are derived copies and need no store of their own.

## 2b. Live copies that drift today

| # | Copies | What happens | Evidence (code, not run) | Severity |
| --- | --- | --- | --- | --- |
| D1 | Selection: URL `id` and engine `selectedIds` | The engine changes the selection in `setFilters` (`engine.ts` about line 730, a selected feature becomes hidden or read-only), `setLens` (about 751), `operate` (about 823, after an operation), `reloadAfterUpload` (about 573), and clipboard paste (`clipboard.ts` line 63). None of these writes `id`. So `id` can name a feature the engine does not select, and a reload selects it again. No code listens to `popstate`, so the engine also does not follow a Back or Forward that nuqs reports. | `grep` for `setParam` and `useSelectedId` finds one writer (`selection.ts`). | Medium. Wrong state after a reload. High once a `push` is added. |
| D2 | Background: stored choice and `visit` vs URL | The URL is never written for background, so a copied link does not show what the author saw. `visit` is a one-time copy of a URL value. | `module-imagery` has no URL import. `App.tsx` `useBackgroundLink` runs once per config. | High. The reported bug. |
| D3 | Filters: URL, stored copy, engine | The writes are paired (`FilterButton.tsx` writes the URL and the stored copy on each change; "Use mine" writes the URL only). That part is right. The banner logic (`differsFromStored`, `startShown` in `url/shown.ts`) exists only to explain a copy that ADR 0009 removes. | `FilterButton.tsx` lines 27-57. The research note in `state-storage-and-url.md` says a URL and storage can still differ after a change. As read, `onChange` writes both, so the note may be out of date. Not run. | Low. Clean up with the banner. |
| D4 | Language: URL `lang` and stored `lang` | The URL wins on every load (`chooseLocale`). If a link says `lang=fr` and the person later stores `de`, the next load shows `fr`. | `mount.tsx` `visitLocale`; `choose.ts`. No setter in the UI yet. | Low now. Fix before a language switch exists. |
| D5 | Data server: URL `api` and stored `server` | The URL wins for the session. In a deployed build a link can select the real OSM API, so the save target is set by a link. The account flyout may then show a different server than the one in use (flyout not traced). | `config.ts` `chooseSource`, `readConfig`; `settings.ts` `server`. | High (save target). |
| D6 | Map position read twice at start | `config.camera` and `cameraParam` hold the same URL value. | `MapView.tsx` `startCamera({ url: cameraParam ?? config.camera, ... })`. | Low. Remove one. |
| D7 | Bearing mirror | `useBearingStore` copies the map's bearing. | `MapView` `setBearing`. | Low. Derived. |

## 3. The background design

### 3.1 What iD does (read from `.reference/id`)

- **`background`**. Value: an imagery source id (the ELI id, for example `Bing` or `EsriWorldImagery...`), `none`, or `custom:<template>`. `background.js` `init` reads `hash.background || hash.layer`. The `layer` name is read but never written.
- **Written on each change**: `background.js` `updateImagery` calls `patchHash({ background, overlays, offset })` on every change of the base layer, the overlays or the offset.
- **Start order** (`background.js` `init`, lines 449-486): (1) the URL `background`; if it is `custom:`, the template is used and saved in the pref `background-custom-template`. (2) the "best" source, only when the URL names none and the source covers more than half of the view (`s.best()`, not an overlay). (3) the last used source, if it is valid for the view (pref `background-last-used`). (4) Bing. (5) the first valid source. (6) none.
- **Note**: iD ranks "best" above the stored last-used choice. Maid's rule (URL, then stored, then default) ranks the stored choice above the default. See Q1.
- **`overlays`**: comma list, in the order the overlays were added (`_overlayLayers`). The locator overlay (`isLocatorOverlay`) and hidden sources are left out. Written as null when empty, so the key disappears.
- **`offset`**: `x,y` in metres, written only when `|x|` or `|y|` is above 0.01, rounded to 2 decimals. Read with `;` or `,` as separator.
- **Brightness** is not in the URL. It is the pref `background-opacity` (`background_display_options.js`, line 18).
- **`background-last-used`** changes only through the picker and the quick switch (`background_list.js` `chooseBackground`, `ui/init.js` quick switch). A link does not change it. A link's `custom:` does change `background-custom-template`.

### 3.2 The Maid design

**URL, in iD's notation:**

| Parameter | Value | Read | Written |
| --- | --- | --- | --- |
| `background` | `<ELI id>` as iD writes it, `none`, or `custom:<template>` | Absent (`null`) means "the URL has no opinion". `layer` is accepted on read only. An unknown id is not rewritten (section 3.3). | On each choice, explicitly, even when the choice equals the default. `clearOnDefault: false`. |
| `overlays` | `<id>,<id>` in the order chosen, or `none` for no overlays | Absent means no opinion. | On each change. An empty list is written as `none`, never removed, so the stored list does not come back (see the note below). |
| `offset` | (carried) | Not read yet. | Only when the feature exists. |

Note on empty overlays: if an empty list were removed from the URL, the stored overlays would show again on the next load, and the person's choice to clear them would be lost. Writing the explicit value `none` avoids that. The docs do not say what `parseAsArrayOf` does with an empty array, so the test in section 4 (S-5) must prove the round trip.

**Storage, version 3 of `maid:imagery`**, same notation as the URL:
- `backgroundId`: `<ELI id>`, `none`, `custom:<template>`, or `null` for "the fork's default" (only the old stored value, which the migration keeps).
- `overlayIds`: as now.
- `brightness`: as now.
- `custom`: `{ name, template }[]`. The key of an entry is its template, not a number. `customNext` and the `custom-N` ids go away.

Migration from version 2: each `custom-N` becomes `custom:<template>` (through the entry's template); `backgroundId` follows; the stored list keeps the names.

**Precedence** (one pure function, a table test):

1. The URL value, if present.
2. Else the stored value, if present.
3. Else the fork's default (`imagery({ default })`).
4. Else (Q1) iD's "best for the view" as a last resort.

Then the resolution: a known ELI id that covers the view is shown. `custom:` and `none` are shown as they are. An unknown ELI id, or one that does not cover the view, is shown as the fallback, and the URL keeps its value.

**Writes**, through one helper in the module (not in the shell):
- A panel choice of a background writes the URL and the stored value. The "from a link" mark clears when the two agree.
- A change of overlays writes the URL and the stored list, with `none` for empty.
- Brightness writes storage only.

**The mark** (ADR 0009, rule 3, not a banner): a small mark at the Background control when the shown value differs from the stored choice. "Use mine" removes the URL key, so the stored choice shows again.

**No more `visit`**: the link is the URL. The first change by the person writes storage, as ADR 0009 says. A link alone writes nothing. Test: open with `background=X`, touch nothing, reload without the parameter; the stored choice is back.

### 3.3 Unknown or not yet loaded values

The ELI list loads after the first render. The URL parser cannot check an id at parse time, so it only checks the string. Resolution waits for the list. While it waits, the fallback is drawn. When the list arrives, the URL is not rewritten. iD rewrites it at once (`updateImagery` at init). Not rewriting avoids churn in the history. Open for Tobias if the rewrite is wanted (Q3).

### 3.4 How module packages read and write URL parameters without the shell

The shell owns `NuqsAdapter` and `params.ts`. A module must not import the shell. Three options:

| Option | How | Verdict |
| --- | --- | --- |
| A. A core registry (recommended) | `packages/core` adds `api.urlParam(name, parser, { history, clearOnDefault, iD })` during `setup`. The call returns a handle with `useValue()` and `set(value)`, a thin wrapper around `useQueryState`. The registry checks names for collisions and feeds the iD mapping. | Keeps one list of names, one place for the iD table (`id-url.ts` `ID_URL_RULES` moves to the registry), and one test for collisions. |
| B. Module definitions read by the shell | A module exports its `urlParams` with its object. The shell builds `ID_URL_RULES`, `fromIdUrl` and `toIdUrl` from them. | Good for the iD table. Combine with A. |
| C. Modules import nuqs directly | Each module calls `useQueryState` itself. | Simple, but names are not checked and the iD table is not built. Not recommended. |

A layered-setting hook in core would replace the logic of `packages/shell/src/url/shown.ts` and the stored copy pattern: `useLayeredSetting({ url, stored, fallback })` returns `{ value, fromLink, use(value) }`, and `use` writes the URL and the stored value together. Background, overlays, lens, notes, photos, filters and language would all use it.

Sketch (not code to ship; the names are for discussion):

```ts
// packages/module-imagery: the parser and the handle
const background = api.urlParam('background', parseAsString.withOptions({ clearOnDefault: false, history: 'replace' }), {
  iD: { name: 'background', convert: 'same' },
})
// in a component under NuqsAdapter
const { value, fromLink, use } = useLayeredSetting({
  url: background.useValue(),
  stored: store.backgroundId,
  fallback: config.default,
  write: (id) => store.actions.setBackground(id),
})
```

## 4. Implementation plan

Each step is about an hour. The order puts correctness first, then the background, then the rest. Each step lists its files and a test. Unit tests run with `bun test <path>`. Browser checks need `bun run dev` and are run by the orchestrator, not in parallel with other edits (AGENTS.md).

| Step | Goal | Files | Test |
| --- | --- | --- | --- |
| S-1 | `map` uses `limitUrlUpdates: throttle(300)` instead of the deprecated `throttleMs`. Read the camera once (remove the `config.camera` duplicate, D6). | `packages/shell/src/url/state.ts`, `packages/shell/src/components/MapView.tsx`, `packages/shell/src/url/params.test.ts` | Unit: round trip of `parseAsCamera` at zoom 2, 10, 17 and 22 for lat and lng (precision). Browser: `check-undo` still passes, no new check. |
| S-2 | One writer for selection (D1). The engine tells the shell about every selection change, and the shell writes `id`. A `popstate` or a URL change selects in the engine. | `packages/renderer/src/engine.ts` (a `onSelectionChange` listener called from `setSelected`), `packages/shell/src/selection.ts`, `packages/shell/src/components/MapView.tsx` | Unit: `selection.test.ts` with a fake engine: an operation's selection writes `id`; a filter that hides the selected feature clears `id`. Browser: a new `check-url` step that runs an operation and then reloads, expecting the same `id`. |
| S-3 | Language in `params.ts` (D4). `lang` is read through `readParams`, not `location.href`. The stored choice is the default. | `packages/shell/src/url/params.ts`, `packages/shell/src/mount.tsx`, `packages/i18n/src/choose.ts`, `packages/i18n/src/choose.test.ts` | Unit: `chooseLocale` cases with `lang` in the URL and the stored value. Browser: `?lang=fr` then a stored `de` with the URL cleared gives `de`. |
| S-4 | Remove the server choice from the public URL (D5), or limit `api` to dev and bench builds. Needs Q5 first. | `packages/shell/src/config.ts`, `packages/shell/src/config.test.ts`, `docs/architecture/08-url-state.md` | Unit: `chooseSource` with `api=osm` in a deployed build gives the first offered server. `check-config` still passes. |
| S-5 | Core registry: `api.urlParam` and `useLayeredSetting` (section 3.4). iD table moves into the registry. | `packages/core/src/` (new `url-state.ts`, with tests), `packages/shell/src/url/id-url.ts`, `packages/shell/src/url/shown.ts` (replaced) | Unit: name collisions refused; `fromIdUrl`/`toIdUrl` round trips still pass (`id-url.test.ts`); precedence table for `useLayeredSetting` (pure function). |
| S-6 | Background: parser, precedence function, writes to the URL, `visit` removed, storage version 3 with migration. | `packages/module-imagery/src/imagery-store.ts`, `packages/module-imagery/src/helpers.ts`, `packages/module-imagery/src/custom.ts`, `packages/module-imagery/src/imagery-store.test.ts`, `packages/shell/src/url/background.ts` (removed), `packages/shell/src/App.tsx` (`useBackgroundLink` removed) | Unit: precedence table (URL, stored, default, unknown id, `none`, `custom:` with `&`, braces and spaces); migration version 2 to 3; template round trip through the URL. Browser `check-background` (new): `?background=custom:<template>` shows the template; choosing a layer writes `background=` into `location.search`; reload without the key shows the stored choice; a link alone does not change storage. |
| S-7 | Overlays: `overlays` with `parseAsArrayOf`, `none` for empty. | `packages/module-imagery/src/imagery-store.ts`, `packages/module-imagery/src/ImageryPanel.tsx` | Unit: empty list writes `none`; order is kept; unknown ids are dropped on resolve. Browser: switch all overlays off, reload, no overlay. |
| S-8 | Lens in the URL (S16). | `packages/module-lenses/src/lens-store.ts`, a new `url.ts` in the module | Unit: a lens id round trip; an unknown id falls back to none. |
| S-9 | Notes in the URL (`notes=1`), and `id` accepts `note/<id>` (S22, S24). | `packages/module-notes/src/store.ts`, `packages/shell/src/url/params.ts`, `packages/shell/src/selection.ts` | Unit: `notes=1` round trip; `id=note/12` parsed as a note. |
| S-10 | Photo options in the URL (S25 to S27, and `photo` if Q7 says so). | `packages/module-street-imagery/src/street-imagery-store.ts`, `packages/module-street-imagery/src/state.ts` | Unit: `photo_dates` in iD's notation round trip. |
| S-11 | Best-for-view as the last fallback (Q1). | `packages/module-imagery/src/helpers.ts` | Unit: the best source covering over half the view wins over the fallback only when the URL and the stored choice are both absent. |
| S-12 | Docs: correct the stale paths (section 6), write the notation table into `08-url-state.md`, and remove the banner text from the research note. | `docs/architecture/08-url-state.md`, `docs/research/state-storage-and-url.md`, `AGENTS.md` (the `?live=` line) | None. Read by a person. |

## 5. Open questions for Tobias

**Decided on 2026-10-15** (Tobias: "follow how iD picks it", and the two answers below; the rest follows iD as AGENTS.md says when in doubt):

- **Q1:** iD's order: the URL, then the "best" source that covers more than half of the view, then the last used one, then the default (Bing in iD), then the first valid source, then none.
- **Q2:** brightness in storage only, as iD.
- **Q3:** as iD: once the imagery list has resolved the start, the URL names the background that is shown. The URL always shows the real state.
- **Q4:** as iD (`background=custom:<template>` in the link), with a hint in the background panel when the template has a part that looks like a key (`token`, `key`, `apikey`, `access_token`, ...): a shared link shares it.
- **Q5:** `api` stays in the URL (decided on 2026-10-14: a person tests against staging and production, `?api=mock|osm|dev`). Automated runs always use the mock.
- **Q6:** iD's `locale` is read as a hand-over; the theme stays in storage.
- **Q7:** the open photo is in the URL (`photo`, iD's form).
- **Q8:** as iD: links may carry remote data layers (`data`, `gpx`) and turn notes on, without asking.
- **Q9:** the display switches stay as they are (setup parameters for development and the benchmark); not part of this work.
- **Q10:** replace everywhere for now.
- **Q11:** A plus B: a core registry of URL parameters, filled by the modules' definitions.


| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| Q1 | When the URL and the stored choice are both silent, does the default follow iD ("best for the view" above the stored last-used choice) or Maid's rule (stored choice above the default)? | (a) iD's order: best, then last used. (b) Maid's rule: stored, then best, then config default. | (b). The person chose the stored source; a default should not beat it. Note the deviation from iD in the ADR. |
| Q2 | Is brightness in the URL? | (a) Storage only, as iD. (b) URL when it is not 1. | (a). It is a device preference, and iD keeps it out of links. |
| Q3 | Should the URL be rewritten once the imagery list resolves an unknown id, as iD does at start? | (a) Keep the URL, show the fallback. (b) Rewrite to the fallback. | (a). Less churn. |
| Q4 | Does a custom tile template go into a link? Templates can hold tokens in the path or the query, and a shared link would then share the token. | (a) Yes, in iD's form. (b) Refuse templates with a token-like part, with a reason. (c) Put only the saved name in the link, and resolve it on the viewer's side. | Decide before S-6. (a) is iD's behaviour; (b) is the safe default for a shared link. |
| Q5 | Is the data server (`api`) out of the public URL? | (a) Remove it for deployed builds; keep it for dev and bench. (b) Keep it, but a link never selects the OSM save target. | (a). It conflicts with `08-url-state.md` rule 7 and sets the save target from a link. |
| Q6 | Theme and language: read iD's `theme` and `locale` from links? | (a) Read iD's names and map them. (b) Ignore them, as now. | (a) for `locale` (it is a hand-over, as the docs say). (b) for `theme` (the stored choice only), unless Tobias wants iD links to carry a theme. |
| Q7 | Is the open photo (`photo`) in the URL? | (a) Yes, the id only (iD's form). (b) No, session only. | (a). A shared link to a photo is useful and small. |
| Q8 | Do links carry data layers and turn notes on? A data URL in a link makes the viewer's browser fetch it. Notes make the viewer's browser call the OSM notes API. | (a) No remote data URLs in links; notes allowed. (b) Neither. (c) Both allowed, with a mark. | (a). Remote data URLs are an arbitrary fetch from a shared link. |
| Q9 | Are the display switches (`fill`, `labels`, `icons`, `pins`) public parameters or storage? | (a) Storage, like iD's `area-fill` pref. (b) URL, as now (they reset each visit). | (a) for `fill` at least. |
| Q10 | Which history mode for a pane or a photo that opens? | (a) Replace everywhere, as iD and as now. (b) Push for an opened photo, so Back closes it. | (a) until a pane needs Back. Then (b), with the popstate sync from S-2. |
| Q11 | Module API: the core registry (option A), or the shell reads module definitions (B), or direct nuqs (C)? | A plus B. | A plus B (section 3.4). |

## 6. Documentation problems found while reading

- `docs/research/state-storage-and-url.md` gives paths that no longer exist: `apps/maid/src/url/params.ts` (now `packages/shell/src/url/params.ts`), `packages/module-imagery/src/store.ts` (now `imagery-store.ts`), `packages/module-street-imagery/src/store.ts` (now `street-imagery-store.ts`), `apps/maid/src/journal.ts` (now `packages/shell/src/journal.ts`), and `apps/maid/src/reference.ts` (now `packages/shell/src/components/reference.ts`). Fix on the next pass.
- `AGENTS.md` describes `?live=1` and `?live=dev`. The code reads `api=mock|osm|dev` (`setupParams.api`, `config.ts`). One of the two is out of date. Tobias should choose which name stays (see Q5).
- `docs/architecture/08-url-state.md` says hand-over parameters are "removed from the URL" after the read. `migrateIdHash` keeps `comment`, `source` and `hashtags` in the query string. (Read; not run.)
- `docs/architecture/08-url-state.md` lists `background` and `overlays` under "What is shown" but they are not read yet. That is the gap this audit covers.
- The research note says a URL and storage can still differ after a change under a link (D3). As read, `FilterButton` writes both on each change. Check in a browser before keeping that claim.

## 7. What was read, what was verified, what was inferred

**Read (code):**
- Zustand stores and `persist` calls: the list from `grep` over `packages/*/src`, and the stores in `packages/ui/src/settings.ts`, `packages/module-imagery/src/imagery-store.ts`, `packages/module-street-imagery/src/street-imagery-store.ts`, `packages/module-lenses/src/lens-store.ts`, `packages/module-data-layers/src/data-layers-store.ts`, `packages/module-notes/src/store.ts`, `packages/module-parking/src/lens/side-state.ts`, `packages/shell/src/modules/validation-ignored.ts`, `packages/ui/src/inspector/recents.ts`, `packages/ui/src/bearing.ts`, `packages/shell/src/stack.ts`, `packages/shell/src/new-feature.ts`, `packages/shell/src/search/flyout.ts`, `packages/shell/src/modules/relations-session-store.ts`.
- URL code: `packages/shell/src/url/*.ts` (params, state, view, shown, background, id-url, public-url, bearing).
- Config and start: `packages/shell/src/config.ts`, `packages/shell/src/App.tsx`, `packages/shell/src/mount.tsx`, `packages/shell/src/selection.ts`, `packages/shell/src/components/MapView.tsx` (the camera, selection and start parts), `packages/shell/src/components/FilterButton.tsx`.
- Engine writes of the selection: `packages/renderer/src/engine.ts` (lines around 573, 730, 751, 823, 1208) and `packages/renderer/src/clipboard.ts` line 63.
- Core: `packages/core/src/storage.ts`, `packages/core/src/layers.ts`.
- i18n: `packages/i18n/src/choose.ts`, `packages/shell/src/mount.tsx`.
- Docs: `docs/adr/0009-decisions-of-2026-10-13.md`, `docs/architecture/08-url-state.md`, `docs/architecture/09-storage-and-settings.md`, `docs/architecture/06-filters.md`, `docs/architecture/07-styles-and-lenses.md` (line 64), `docs/research/state-storage-and-url.md`, `docs/build-out/steps.md` (C1 and D1 notes).
- iD (`.reference/id`): `modules/behavior/hash.js`, `modules/renderer/background.js`, `modules/renderer/features.js`, `modules/renderer/photos.js`, `modules/svg/notes.js`, `modules/core/context.ts`, `modules/ui/commit.js`, the `patchHash` callers in `modules/services/*.js`. The lines of `background.js` are quoted from a read of the file, not from a run.
- nuqs docs (nuqs.dev): options page, parsers page, adapters page, custom parsers page (`/docs/parsers/making-your-own`), batching page. The `utils`, `faq` and `use-query-states` pages returned 404.

**Verified (in the installed source):**
- nuqs 2.10.1 (`node_modules/.bun/nuqs@2.10.1.../dist`): the React adapter subscribes to `popstate` and re-reads the URL. Maid's own code adds no `popstate` listener (`grep` finds none).
- nuqs docs: `throttleMs` is deprecated since 2.5.0; `clearOnDefault` defaults to true since 2.0; `history` defaults to `replace`.

**Inferred (not run, to be checked):**
- That `overlays` with an empty list is lost on reload without the explicit `none`. This follows from the code (an absent key means no opinion), not from a browser run.
- That an operation or paste leaves `id` stale (D1). Based on the code paths; the delete path was not traced in full.
- That the account flyout can show a different server than the one in use (D5). Not traced.
- That the ELI list marks some sources as "best" with coverage over half the view. Taken from iD's code; not checked against the ELI package in this repo.
- The behaviour of `parseAsArrayOf` with an empty array, and of `serialize` for an empty string, in nuqs 2.10.1. The docs do not say. The test in S-7 must settle it.

No file was changed except this report. No commit, no `bun run check`, no browser, no dev server, no contact with any OSM host.
