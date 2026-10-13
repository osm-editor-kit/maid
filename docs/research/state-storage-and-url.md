# State storage and the URL: iD and Maid

Status: research, 2026-10-13. Read from code only. Nothing was run in a browser. iD paths are in `.reference/id/` (pinned, read-only). The map rule is decided by the owner. Everything else is for decision.

## Summary

- iD keeps its state in about 30 localStorage keys, one cookie, one IndexedDB record and the URL hash. Maid keeps its state in seven localStorage stores, one IndexedDB journal and the URL query.
- A link can overwrite your stored choice in iD. In Maid a link never writes storage, but a link's filters replace yours for the session with a banner.
- iD remembers the last map position. Maid remembers no position at all.
- Maid carries most iD link parameters but does not read them, so a link cannot set the background, overlays, photos or data layers.
- The built filter banner was a quick decision. The owner's proposal (docs/architecture/09) asked for an indicator at the setting, not a banner.

## The map: decided

**The URL wins always.** When the URL has a map position, it sets the view, whatever is stored. A stored last position (if Maid adds one) is only a fallback for a visit without `map=`.

## Part 1: iD

### 1.1 Where state lives

| Place | Name | What it holds | Written | Read |
| --- | --- | --- | --- | --- |
| localStorage (`prefs()`) | about 30 keys, listed in 1.2 | settings, last view, panel states, changeset text | `core/preferences.js` `corePreferences`; falls back to memory if localStorage is missing | same |
| sessionStorage | none | | | |
| Cookie | `lock` | one tab owns the saved edits: set for 5 s, renewed every 4 s | `util/session_mutex.js` `lock`, `renew` | `core/history.js:66` |
| IndexedDB (`idb-keyval`) | db `keyval-store`, store `keyval`, key `saved_history` | the unsaved edits as JSON | `core/history.js` `save` (701-716) | `core/history.js` `restore` (744-752); `.reference/id/node_modules/idb-keyval/dist/index.js:28-31` |
| OSM user preferences (server) | none | | | `services/osm.js:28` requests `read_prefs write_prefs`, but no code calls `user/preferences` |
| OAuth token | localStorage, key = OSM server URL + `oauth2_access_token` (also `oauth2_state`, `oauth2_pkce_code_verifier` during login) | the access token | `.reference/id/node_modules/osm-auth/src/osm-auth.mjs` `token` (55-67) | same; popup mode, since `services/osm.js:24-31` sets no `singlepage` |

### 1.2 The localStorage keys

| Key | Holds | Written | Read |
| --- | --- | --- | --- |
| `map-location` | last view, `zoom/lat/lng` | `behavior/hash.js` `patchHash` (54-56), each time the hash changes | `behavior/hash.js` `behavior` (240-243) |
| `background-last-used`, `background-last-used-toggle` | base layer, and the one before (Cmd+`) | `ui/sections/background_list.js` `chooseBackground` (314-315); `ui/init.js` quick switch (398-399) | `renderer/background.js` `init` (450); `ui/init.js` (395) |
| `background-custom-template` | custom imagery template | `renderer/background.js` `init` (476, from `background=custom:`); `ui/settings/custom_background.js` (98, 106) | `renderer/background.js` (86) |
| `background-opacity` | brightness | `ui/sections/background_display_options.js` (38) | same file (18) |
| `disabled-features` | feature filters | `renderer/features.js` `update` (62) | `renderer/features.js` `init` (615) |
| `settings-custom-data-url` | custom data URL | `ui/settings/custom_data.js` (115); `ui/sections/data_layers.js` (286) | `ui/settings/custom_data.js` (18) |
| `area-fill`, `area-fill-toggle` | area fill style, wireframe toggle | `renderer/map.js` (1093-1095) | `renderer/map.js` (1091, 1108) |
| `validate-what`, `validate-where`, `validate-square-degrees`, `validate-disabledRules` | issue options and disabled rules | `ui/sections/validation_options.js` (75); `validation_rules.js` (179); `core/validator.js` (430, 446) | `validation_options.js` (65-66); `core/validator.js` (88); `validations/unsquare_way.js` (58) |
| `preset_recents` | recent presets, JSON | `presets/index.js` `setRecents` (483) | `presets/index.js` `getRecents` (490) |
| `disclosure.<section>.expanded`, `entity-issues.reference.expanded` | open or closed panels | `ui/disclosure.js` (97); `ui/sections/entity_issues.js` (131) | `ui/disclosure.js` (24); `entity_issues.js` (15) |
| `raw-tag-editor-view` | list or text view | `ui/sections/raw_tag_editor.js` (108) | same file (41) |
| `turn-restriction-distance`, `turn-restriction-via-way0` | defaults of the restriction field | `ui/fields/restrictions.js` (147, 189) | same file (22-23) |
| `preferences.privacy.thirdpartyicons` | third-party icons on or off | `ui/sections/privacy.js` (37) | `ui/preset_icon.js` (382) and four more |
| `comment`, `hashtags`, `source`, `commentDate` | changeset text and when it was set | `ui/commit.js` `initChangeset` (75-84), `changeTags` (483-492); `core/history.js` `clearSaved` (731-733) | `ui/commit.js` (64-70: 2-day expiry; 89-104) |
| `has_saved_history` | a saved history exists | `core/history.js` (709, 713, 728, 758) | `core/history.js` (69) |
| `walkthrough_started`, `walkthrough_progress`, `walkthrough_completed` | walkthrough progress | `ui/intro/intro.js` (119, 141, 149, 154) | `intro.js` (122); `ui/commit.js` (596-606) |
| `sawSplash`, `sawPrivacyVersion`, `sawVersion` | what the person has seen | `ui/splash.js` (27-28); `ui/version.js` (26) | `splash.js` (18-19); `version.js` (19) |
| `iD_<origin>_saved_history` | old saved history, moved to IndexedDB | cleared on migration (`core/history.js` 759) | `core/history.js` `migrateHistoryData` (754) |

Not stored by iD: theme, language, sidebar width, presets. There are no favourite presets in this iD (grep finds none).

### 1.3 URL parameters

iD reads and writes the hash. `patchHash` keeps every key it does not change (`behavior/hash.js` 18-29), so unchanged keys survive.

| Parameter | Sets | Read | Written while working | In URL after reload |
| --- | --- | --- | --- | --- |
| `map` | view `zoom/lat/lng` | `hash.js` `hashchange` (165-176), also at start (250) and `behavior` (238) | yes: each map move, throttled 500 ms (147-150, 90-92) | yes |
| `id` | selection, `n1`, `w2`, `note/…` | `hash.js` (178-190); `behavior` (218-232): zooms to it when there is no `map` | yes, live (81-88) | yes |
| `background` (or `layer`), `custom:<template>` | base layer | `renderer/background.js` `init` (449, 473-477) | yes, `background.js` (215-217) | yes |
| `overlays` | overlay layers | `background.js` `init` (493-497) | yes, `background.js` (217) | yes |
| `offset` | background offset, metres | `background.js` `init` (508-516) | yes, when not zero (216-218) | yes |
| `gpx` | data layer URL | `background.js` `init` (501-505) | no | yes, kept |
| `disable_features` | feature filters, `;` or `,` | `renderer/features.js` `init` (614) | yes, `features.js` `update` (61) | yes |
| `photo_overlay` | photo layers on | `renderer/photos.js` `init` (207-220) | yes, `photos.js` (27) | yes |
| `photo_dates`, `photo_username`, `photo_type` | photo filters | `photos.js` `init` (207-217) | yes, `setUrlFilterValue` (87, 111, 133, 145-147) | yes |
| `photo` | open photo, `service/key` | `photos.js` `init` (225-240) | yes, by each photo service (for example `services/streetside.js` 677); null on close | yes |
| `comment`, `source`, `hashtags` | changeset defaults | `core/context.ts` (195-197), once at start | no: removed by `computeHashUpdate` (`hash.js` 73-79) | no |
| `walkthrough` | start the walkthrough | `hash.js` `behavior` (234-236) | no: removed by `computeHashUpdate` (77) | no |
| `presets` | presets that can be added | `core/context.ts` (722-725) | no | yes, kept |
| `locale`, `rtl` | interface language and direction | `hash.js` `hashchange` (160-163); `core/localizer.ts` (253-259); `context.ts` (727-728) | no | yes, kept |
| `theme` | `light` or `dark` | `hash.js` `hashchange` (156-158); `context.ts` (731-732) | no | yes, kept |
| `notes` | show the notes layer | `svg/notes.js` (11-13), once | no | yes, kept |
| `maprules` | MapCSS rules to load | `context.ts` (754-756) | no | yes, kept |
| `validationError`, `validationWarning`, `validationSuggestion`, `validationDisable` | severity overrides | `core/validator.js` (43-46) | no | yes, kept |

### 1.4 Which value wins at start

| State | Order, strongest first | Code |
| --- | --- | --- |
| Map position | URL `map`; else `map-location`, but only when the URL has no `id`; else [0, 0] at zoom 2 | `hash.js` `behavior` (238-248); `ui/init.js` (358-359) |
| Selected feature | URL `id` | `hash.js` `behavior` (218-232) |
| Base layer | URL `background` or `layer` (or `custom:`); else the automatic "best" for the view (only when the URL gives none, and it covers more than half the view); else the last used one, if valid for the view; else Bing; else the first valid; else none | `renderer/background.js` `init` (449, 458-471, 476-486) |
| Overlays | URL `overlays`, added to the locator overlay | `background.js` (493-497); no stored value |
| Offset | URL `offset` | `background.js` (508-516); no stored value |
| Brightness | stored `background-opacity`; else 1 | `background_display_options.js` (18) |
| Feature filters | URL `disable_features` if not empty; else stored `disabled-features` | `renderer/features.js` `init` (614-621) |
| Changeset text, source, hashtags | URL values (applied after the stored 2-day expiry); else stored | `ui/commit.js` `initChangeset` (64-86) |
| Language | URL `locale`; else browser languages | `hash.js` (160); `context.ts` (727-728); `util/detect.ts` (104-105) |
| Theme | URL `theme`; else the operating system (`css/10_colors.css` 68) | `context.ts` (731-732) |
| Panel open or closed | stored `disclosure.<key>.expanded`; else the section's default | `ui/disclosure.js` (24) |
| Walkthrough | URL `walkthrough=true` starts it; stored progress only resumes it | `hash.js` (234-236); `intro.js` (122) |
| Saved edits | not a value: offered on start (1.7) | `core/history.js` (69); `ui/init.js` (442-446) |

### 1.5 What a change by the person writes, and whether a link overwrites storage

- **Map:** the URL and `map-location` both change. `patchHash` writes `map-location` whenever the hash changes (`hash.js` 45, 54-56). A link with `map=` moves the map, which fires `move` (`renderer/map.js` 902-905) and so rewrites `map-location`. A shared link therefore changes what the next plain visit shows.
- **Base layer:** the URL changes. `background-last-used` changes only through the picker and the quick switch, never from a link. A link's `custom:` does write `background-custom-template` (`background.js` 476), so it does change the next visit.
- **Overlays, offset, photos, `gpx`:** URL only. Nothing is stored.
- **Feature filters:** the URL and `disabled-features` both change (`features.js` 61-62). A link's `disable_features` replaces the stored set on load, because the first `update` writes the link's set to storage.
- **Changeset text:** a link's `comment` is written to `comment` and `commentDate` (`ui/commit.js` 73-76). It replaces the stored text.
- **Theme, locale, presets, `maprules`, validation:** URL only, never stored.

Summary: a link overwrites storage for `map-location`, the custom template, feature filters and changeset text. It does not for the last-used background, overlays, offset, photos, theme or locale.

### 1.6 The map position in iD

- **Stored:** `map-location`, written each time the hash changes while `map` is present (`hash.js` 54-56).
- **Default:** [0, 0] at zoom 2 when there is neither a URL map nor a stored position (`ui/init.js` 358-359).
- **Geolocation:** "zoom to my location" (`ui/geolocate.js` 48) moves the map. The URL and `map-location` follow through the move event. Nothing else is stored.

### 1.7 Saved edits and the restore prompt

- **Key:** IndexedDB `keyval-store` / `keyval` / `saved_history`. The flag `has_saved_history` is in localStorage (`core/history.js` 69, 703-716).
- **Lock:** the cookie `lock`, taken when the history is created (`history.js` 66, 69). Only the tab that holds it writes (`history.js` 702).
- **Offered:** on start, only when this tab holds the lock and `has_saved_history` is set, and the page does not start the walkthrough (`history.js` 69; `ui/init.js` 442-446; `ui/restore.ts`).
- **Protection:** while the question is open, saves are skipped, so stored edits are not overwritten (`history.js` 702-705). "Restore" loads the JSON. "Reset" calls `clearSaved`, which also clears comment, hashtags and source (`history.js` 722-733).
- **Writes:** debounced 100 ms (`core/context.ts` 451) and on page unload (`ui/init.js` 363-364). Not while a modal is open or in the intro (`context.ts` 421-422).

### 1.8 Cookies and accounts

- One cookie: `lock`. No sessionStorage. IndexedDB holds only the saved history.
- Login: osm-auth popup (`services/osm.js` 23-31). The token is in localStorage (see 1.1). Server user preferences are never read or written, although the `read_prefs` and `write_prefs` scopes are requested.

## Part 2: Maid

### 2.1 Where Maid keeps state

| Store | Key | Holds | Written | Skipped under automation? |
| --- | --- | --- | --- | --- |
| localStorage (zustand `persist`) | `maid:settings` v3 | theme (default `system`), `sizes` (`sidebar-width`, `dock-height`), `shown.filters`, `favourites` | `packages/ui/src/settings.ts` setters (57-65); `FilterButton.tsx` (66) | **No.** No `storage` option, so zustand's default localStorage is used (`settings.ts` 67-75) |
| localStorage | `maid:imagery` v1 | `backgroundId`, `overlayIds`, `brightness` | `packages/module-imagery/src/store.ts` (31-39, 41-53) | Yes: `moduleStorage` returns nothing (`packages/core/src/storage.ts` 22) |
| localStorage | `maid:data-layers` v1 | `added` (layers pasted as a URL in the Data layers panel, `Panel.tsx` 311), `hidden` ids | `module-data-layers/src/store.ts` (64-75) | Yes |
| localStorage | `maid:notes` v1 | `enabled`, `showClosed` | `module-notes/src/store.ts` (31-32) | Yes |
| localStorage | `maid:lenses` v1 | `activeId`, imported lenses | `module-lenses/src/store.ts` (31-42) | Yes |
| localStorage | `maid:street-imagery` v1 | `providers`, `photoKind`, `date` | `module-street-imagery/src/store.ts` (73-84) | Yes; photos are also off (`store.ts` 14) |
| localStorage | `maid.reference:<tag>` | wiki answers, 30 days | `apps/maid/src/reference.ts` `writeStored` (204-209) | Yes: `loadReference` returns before reading (233) |
| localStorage | `maid:osm-dev-user` | display name after login | `apps/maid/src/auth.ts` `login` (74), `logout` (87) | Not read (`auth.ts` 37) |
| localStorage | `__osmAuth` (osm-api 4.0.1) | access token, issue time, scopes | `apps/maid/node_modules/osm-api/dist/index.js` (5558); removed on logout (5740) | Login is off (`auth.ts` 30); not read (37) |
| IndexedDB (Dexie) | db `maid:scene:<name>`, `maid:osm`, `maid:osm-dev`; tables `edits`, `meta` | unsaved edits, one record per edit | `packages/journal/src/journal.ts` (143-149); `apps/maid/src/journal.ts` (18-20) | **No guard** in either file. The checked bench scripts use fresh browser contexts (`tools/bench/shot.ts` 20, `edit.ts` 18, `quick-pan.ts` 16) |
| Web Locks | `maid-journal:<name>` | one tab writes a journal | `journal.ts` (172-180, 251) | not applicable |
| Cookies, sessionStorage | none | | | |
| In memory only | map view, selection (URL), open photo (`store.ts` 34), save text (`components/SaveButton.tsx` 23), data layer files, notes cache, panel open state (no `persist` found) | | | |

### 2.2 URL parameters

Maid keeps state in the query string, read and written with nuqs. Parsers are in one place (`apps/maid/src/url/params.ts`).

| Parameter | Used for | Read | Written | Survives reload |
| --- | --- | --- | --- | --- |
| `map` | view, `zoom/lat/lng` (OSM zoom) | `params.ts` `parseAsCamera` (21-34); `config.ts` (74); `url/state.ts` `useCameraParam` (7-9) | at each move end, replacing, throttled 300 ms (`MapView.tsx` `handleMoveEnd` 148-150; `state.ts` 8) | yes |
| `id` | selected feature, comma list | `state.ts` `useSelectedId` (17-19); `selection.ts` (9-19); `MapView.tsx` `handleLoad` selects it | on each selection, replacing (`selection.ts` 17) | yes. Selects only; does not move the map |
| `filters` | filter states that differ, for example `buildings:readonly` | `config.ts` `readFilters` (44-49); `editor.ts` (26-31) | on each change, replacing (`FilterButton.tsx` 27-30) | yes. Not written at load from storage |
| `disable_features` (iD form, carried) | filters, converted to `<id>:hidden` | `config.ts` (47-48); `filters.ts` `fromIdDisableFeatures` (201-208) | never by Maid; kept after migration | yes. `filters` wins when both exist (`config.ts` 45-46) |
| `background`, `overlays`, `offset`, `comment`, `hashtags`, `source`, `locale`, `gpx`, `photo`, `photo_overlay`, `photo_dates`, `photo_username` (carried) | nothing yet | no reader in `apps` or `packages` | never | yes, kept but inert |
| `presets`, `walkthrough`, `rtl`, `maprules` (dropped) | not applicable | removed by `migrateIdHash`, reported in the console (`url/id-url.ts` 36-47, 124) | | no |
| any other iD name, for example `theme`, `notes`, `validation*` | not applicable | dropped (`id-url.ts` 88-89) | | no |
| setup: `scene`, `live` (`0`, `1`, `dev`), `ui`, `labels`, `icons`, `pins`, `fill`, `workers`, `minDataZoom`, `tolerance`, `sourceMaxZoom`, `fade` | development and bench switches | `params.ts` `setupParams` (53-67); `config.ts` `readConfig` (52-73) | never | yes, only in the URL |

Notes:
- `migrateIdHash` runs at start, and only when the hash contains `map`, `id`, `background`, `disable_features`, `comment` or `hashtags` (`id-url.ts` 120). An explicit query parameter wins over the same hash name (`fromIdUrl`, 92).
- `toIdUrl` ("Open in iD") has no caller outside its tests (`id-url.ts` 101; `id-url.test.ts`). It is not wired. `filters` is not in `ID_URL_RULES`, so it would be dropped.
- The bench reads `id` from the URL (`tools/bench/interactions-check.ts` 107; `draw-check.ts` 36).

### 2.3 What wins today, and what the person sees

- **Map:** the URL `map` (state), else `config.camera` (the same URL, read once), else `FALLBACK_CAMERA` at zoom 17, 52.389 / 13.4 (`MapView.tsx` 41, 112). No position is stored. A link without `map=` opens the same place every time.
- **Selection:** the URL only.
- **Filters:** the link (`filters`, or converted `disable_features`), else the stored `shown.filters`, else the editor's own defaults (`editor.ts` 26-31; `packages/core/src/layers.ts` `startSetting` 26-33). While the start value comes from a link, changes are not stored (`FilterButton.tsx` 66; `layers.ts` `writesStored` 36-38).
- **Background and overlays:** stored only (`maid:imagery`). A link has no effect.
- **Photos:** the providers, kind and date are stored. The open photo is session only. A link's `photo` has no effect.
- **Data layers, lenses, notes:** stored only. A link's `gpx` has no effect.
- **Theme, panel sizes, favourites:** stored in `maid:settings`. Theme is applied before render (`packages/ui/src/theme.ts` `initTheme`). Sizes are keyed `sidebar-width` (`Shell.tsx` 30) and `dock-height` (`Dock.tsx` 20).
- **Recent presets, language, changeset history:** none. The save text is session state (`SaveButton.tsx` 23).
- **Unsaved edits:** the journal is checked on start. If it has edits, the restore prompt covers the app until answered (`apps/maid/src/journal.ts` 50-54, 61-72; `RestorePrompt.tsx`).

### 2.4 The quick decision: link filters and the banner

What was built:
- **d4b302d** (2026-10-12, "Editor: unsaved edits survive a reload, filters are remembered"): `startSetting`, `writesStored` (`packages/core/src/layers.ts`), `fromLink` and `setFromLink` (`packages/ui/src/settings.ts`), and the banner in `FilterButton.tsx`.
- **de586f4** ("UI: flyouts for the feature type, the filters and the account"): the filters moved into a flyout. The banner now appears only inside it.
- **The proposal it departs from:** `docs/architecture/09-storage-and-settings.md` (2026-10-11, lines 91-95) asks for "From the link. Use mine" as an indicator at the setting, with "No banner across the app".

What the person sees:
- A banner at the top of the Filters flyout: "These filters come from the link you opened.", with "Use mine" and "Keep these as mine" (`FilterButton.tsx` 33-57). Nothing else says so. The top-bar button shows a count of changed filters, whatever their source (78-100).

What is written:
- A change under a link goes to the URL and the session, not to storage (`FilterButton.tsx` 27-30, 63-67).
- "Use mine" applies the stored value and clears the flag (39-42).
- "Keep these as mine" copies the link's value into storage (49-52).

Known gaps:
- `docs/build-out/steps.md` (C1, line 111) records that a link copied before the first change lacks the stored filters, because stored filters are not written to the URL at load.
- Found while reading, not run: after a change under a link, the URL holds the new value. On the next load the URL and storage still differ, so the banner says the filters come from the link, although the person made the change.

Background (commit 0464be6): it changed only `docs/build-out/steps.md`. The chosen background is kept in `maid:imagery` (`module-imagery/src/store.ts` 41-53). Maid does not read `background=`, so no link rule was needed in code. `docs/architecture/09` lists background among the settings a link can carry (line 99). That is not built.

## Part 3: Side by side, and the decisions

| State | iD URL | iD storage | iD order | Maid URL | Maid storage | Maid order | Same? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Map position | `map` (live) | `map-location` | URL > stored > [0,0] z2 | `map` (at move end) | none | URL > Berlin z17 | No: Maid keeps no last position |
| Selected feature | `id` (live) | none | URL, zooms if no `map` | `id` (live) | none | URL, selects, no zoom | Mostly |
| Base layer | `background`, `layer`, `custom:` | `background-last-used`, `background-custom-template` | URL > best for view > last used > Bing > first | none (carried) | `maid:imagery.backgroundId` | stored > package default | No |
| Overlays | `overlays` | none | URL, on top of locator | none (carried) | `maid:imagery.overlayIds` | stored | No |
| Background offset | `offset` | none | URL | none | none (not built) | n/a | No |
| Brightness | none | `background-opacity` | stored, else 1 | none | `maid:imagery.brightness` | stored | Yes |
| Feature filters | `disable_features` | `disabled-features` | URL if set > stored; a change writes both | `filters` and converted `disable_features` | `maid:settings.shown.filters` | link > stored > default; link changes not stored | No |
| Photo overlays | `photo_overlay` | none | URL | none (carried) | `maid:street-imagery.providers` | stored | No |
| Open photo | `photo` | none | URL | none (carried) | none | session | No |
| Photo filters | `photo_dates`, `photo_username`, `photo_type` | none | URL | none (carried) | `maid:street-imagery.date` | stored | No |
| Data layers | `gpx` (read only) | `settings-custom-data-url` | URL loads the file; storage holds the template | none (carried) | `maid:data-layers` | stored | No |
| Lenses | none | none | n/a | none (planned) | `maid:lenses` | stored | n/a |
| Notes layer | `notes` (read once) | none | URL | none | `maid:notes` | stored | No |
| Theme | `theme` (read) | none | URL > system | none (dropped) | `maid:settings.theme` | stored (default system) | No |
| Panel sizes | none | none | n/a | none | `maid:settings.sizes` | stored | Maid only |
| Panels open | none | `disclosure.<key>.expanded` | stored > section default | none | none | session | No |
| Favourites | none | none in this iD | n/a | none | `maid:settings.favourites` | stored | Maid only |
| Recent presets | none | `preset_recents` | stored | none | none | n/a | iD only |
| Language | `locale`, `rtl` (read) | none | URL > browser | `locale` carried, inert | none | English only | No |
| Changeset text, source, hashtags | `comment`, `source`, `hashtags` | same keys, plus `commentDate` | URL overwrites stored; stored expires after 2 days | carried, inert | none (session) | n/a | No |
| Unsaved edits | none | IndexedDB `saved_history`, lock cookie | offered if the lock is free | none | IndexedDB journal, Web Locks | offered on start | Similar idea, other stores |
| Login | none | osm-auth token in localStorage | popup, OSM server | none | `__osmAuth`, display name | dev server only | Different scope |
| Live or fixture | none | none | n/a | `live` (read once) | none | URL; forced off under automation | Maid only |
| Walkthrough | `walkthrough` | `walkthrough_*` | URL starts it | dropped | none | n/a | iD only |
| Validation options | `validation*` (overrides) | `validate-*` | stored; URL overrides rules | dropped | none | build config | No |
| Automated runs | n/a | n/a | n/a | module stores skipped; `maid:settings` and journal not | | | Differ |

### Decisions for the owner

Each item lists the options, what iD does and a recommendation.

1. **Filters from a link: how it is shown, and where it is stored.** Options: (a) banner in the flyout, as built; (b) indicator at the setting, as in docs/architecture/09; (c) count in the top bar only. iD: no indicator. A link's filters replace the stored set on load, and the first change writes them to storage (`features.js` 614-621, 61-62). Recommendation: (b). Also write the effective filters into the URL at load, to close the gap in steps.md, and decide what "from the link" means once the person has changed them.
2. **Map: does Maid remember the last position?** Options: (a) no, as today; (b) keep it as the fallback for a visit without `map=`, and never let a link write it; (c) overwrite it from a link, as iD does. iD: (c). Recommendation: (b). The decided rule still applies: the URL wins over any stored position.
3. **Base layer and overlays from a link.** Today they are inert. Options: (a) the URL wins for the session and is not stored; (b) the URL wins and is stored, as iD does for the custom template; (c) drop them from the docs. Recommendation: (a).
4. **Changeset text from a link.** Options: (a) prefill the save dialog for the session only; (b) store it for two days, as iD does (`commit.js` 64-86); (c) inert. Recommendation: (a). The person must choose the text of their own changeset.
5. **Theme and language from a link.** Options: (a) no URL layer, as today and as docs/architecture/08 says; (b) the URL wins for the session, as iD does for theme. Recommendation: (a) for theme. For `locale`, keep the one-time hand-over that docs/architecture/08 describes, or drop it.
6. **What is shown goes into the URL.** docs/architecture/08 says background, overlays, filters, lens and photo options are written on change. Only filters are. Options: build it, or change the doc. Recommendation: build it, so that a link shows the view its author saw.
7. **Storage under automation.** `maid:settings` and the journal are written in automated runs; the module stores are not. Options: one rule for all stores, or leave it and write it down. Recommendation: one rule.
8. **Background order.** iD puts an automatic "best for the view" ahead of the person's last choice (`background.js` 458-481). Maid's stored choice wins over the package default. Recommendation: keep the person's choice first, as Maid does.

### Proposed general rule

The effective value is the URL's value when the URL has one, else the person's stored choice, else the default. A link never writes storage; the person's own change writes to the URL and to storage, except while the value comes from a link, when it writes to the URL only until the person picks "Use mine" or "Keep these as mine".

Exceptions, each with its reason:
- **Map:** the URL always wins. A stored last position, if added, is only a fallback, and a link never writes it. A view is not a setting.
- **Selection and open photo:** URL only. They are what a shared link is for; storing them would open an old feature on the next visit.
- **Changeset text:** prefills the session only. The person writes their own text.
- **Theme and language:** no URL layer. A link should not change the whole interface for the next visit.
- **`gpx` data:** session only. It is a link's data, not a preference.

## Not checked

- Nothing was run. Every statement comes from reading the code, including the banner-after-reload finding in 2.4 and the storage-under-automation claims in 2.1.
- iD: whether `centerZoom` at start always leads to a `map-location` write (inferred from `renderer/map.js` 902-905 and `hash.js` 45, 54-56).
- iD: the section default used by `ui/disclosure.js` when nothing is stored (line 24 read only, not in full).
- iD: how `zoomToEntities` behaves for an entity that is not loaded yet.
- iD: whether `features.init` rewrites the URL while it disables each feature in turn.
- iD: service workers and Cache Storage were not searched.
- Maid: whether `map` is written at start, before any move by the person.
- Maid: what `id=` does when the feature is not in the loaded data (`MapView.tsx` `handleLoad` read only).
- Maid: the default background passed to `createImageryStore`, and the package it comes from.
- Maid: which panels are open is in component state. Not checked component by component.
- Maid: whether `tools/bench/run.ts` clears storage between runs (only the other scripts were checked).
- Maid: whether the filter ids match iD's categories, so that `disable_features=buildings` means the same thing.
- Maid: whether `filters` is re-applied when the person goes back or forward in history.
