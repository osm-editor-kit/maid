# Radnetz custom background, Maid imagery, and toasts

Date: 2026-10-13. Read-only research: nothing was edited, run or fetched. Paths are relative to each repo's root.

Repos named below:
- **Radnetz fork**: the iD fork, folder `iD--radnetz-berlin` under `OSM/`, branch `radnetz-berlin` (HEAD `e8d5831bf`).
- **Maid**: this repo. Its pinned iD copy is `.reference/id` (iD v2.42.2, commit `0194f3926`).
- **tilda-geo**: folder `tilda-geo` under `FMC/`, branch `develop` (HEAD `c0cece000`). Code is in `app/`.

"Read" means I opened the file. "Inferred" means I worked it out from the code without running it.

## Summary

- **Maid does not have a custom background today.** Its imagery module lists ELI layers only. No template input, no custom storage, and the URL parameter `background` is only carried through, not acted on.
- **Radnetz fork**: a plus button in the Background pane opens a dialog (name, tile URL template, token help). Saved entries form a list with edit and delete. The token engine is the same as upstream iD. Settings live in localStorage (`background-custom-templates`, `background-custom-next-id`, `background-last-used*`) and the hash carries `background=custom:<template>`. In the fork that hash link also writes to storage, which conflicts with ADR 0009 for Maid.
- **Toasts**: tilda-geo uses **sonner 2.0.7**, mounted once in the root layout with `position="top-right"`, `richColors`, `closeButton`. Maid has no toast yet.

---

## Job 1: the Radnetz fork's custom background

### 1.1 Entry point and list (Radnetz fork, read)

Files: `modules/ui/sections/background_list.js`, `modules/renderer/custom_backgrounds.ts`, `modules/renderer/background.js`.

- **Add**: a plus button (`button.add-custom-background`, tooltip "Add custom background") in the header of the Backgrounds section of the Background pane.
- **Rows**: each custom entry is a radio row labelled `Custom: <name>`. Without a name the label is a short host and path taken from the template (`customTemplateLabel`: protocol, `www.`, query, hash and everything from the first `{` are dropped). The tooltip shows the full template in a `<code>` element. Custom rows sort first, in creation order (by the numeric part of the id). The ⌘B quick switch still works on them.
- **Edit**: a pencil button per row (tooltip "Edit custom background"). Clicking a row whose template is empty also opens the editor.
- **Delete**: a trash button per row (tooltip "Delete this custom background"), then a confirm modal: header "Delete custom background", text `Delete “{name}”? This cannot be undone.`, buttons Cancel and Delete. Deleting the selected entry falls back to "None".
- Strings: `data/core.yaml` under `settings.custom_background` and `background.custom_*`.

### 1.2 The dialog (Radnetz fork, read: `modules/ui/settings/custom_background.ts`)

- A modal (`uiConfirm`) with class `settings-custom-background`. Header: "Custom Background Settings".
- A callout with the licence reminder: "Make sure that the used background imagery is allowed to be used for mapping." plus a "Read more." link to the OSM wiki FAQ (new tab).
- **Name (optional)**: one text input. Focused when the dialog opens.
- **Tile URL template**: a textarea, placeholder "Enter a URL template". Under it an example line, `https://tile.openstreetmap.org/{zoom}/{x}/{y}.png`.
- Two collapsed disclosures, "Supported WMS tokens" and "Supported TMS tokens", with the token list from `data/core.yaml`. They do not store their open state (`updatePreference(false)`).
- **Buttons**: Cancel and Save. Save is disabled while the template is empty (checked on each input).
- **Validation**: only "not empty". No check of scheme, host or tokens. On save the template loses newlines and surrounding whitespace (`cleanCustomTemplate`).
- **Duplicates**: an exact match (after cleaning) returns the existing entry instead of making a second one. Editing an entry into a template another entry already has merges the two, and the typed name is carried over.
- **Blank template**: `addOrGetCustomSource` returns null and `updateCustomSource` ignores the change, so nothing is saved.

### 1.3 Template tokens (Radnetz fork, read: `modules/renderer/background_source.js`, `url()`)

- The logic is the same as upstream iD (`.reference/id/modules/renderer/background_source.js`, `url()`). The only change is that `source.id === 'custom'` became `source.isCustom`.
- Type guess from the tokens: WMS if `SERVICE=WMS` or `{proj}`, `{wkid}` or `{bbox}` appears (projection assumed EPSG:3857); TMS if `{x}` or `{y}` appears; Bing-style if `{u}` appears.
- Supported: `{zoom}` or `{z}`, `{x}`, `{y}`; `{-y}` or `{ty}` (flipped y); `{@2x}` or `{r}` (retina, only on retina screens); `{switch:a,b,c}` (host chosen by `(x + y) % n`); `{u}` (quadkey); WMS `{proj}`, `{wkid}`, `{width}`, `{height}` (tile size), `{bbox}`, and `{w}`, `{s}`, `{n}`, `{e}`.
- The hash part of the template (`#…`) is stripped before use.

### 1.4 Stored settings (Radnetz fork, read)

iD's `prefs()` writes straight to localStorage under the plain key (`modules/core/preferences.js`). There is no prefix.

| key | value | written when |
| --- | --- | --- |
| `background-custom-templates` | JSON array of `{ "id": "custom-N", "name": string, "template": string }` | add, edit, delete, and a link that names a new template |
| `background-custom-next-id` | string integer, a counter that is never reused | each new entry |
| `background-custom-template` | legacy single template string | read once: migrated to `custom-1`, then removed. Not written any more |
| `background-last-used` | background id, e.g. `custom-3` | choosing a background |
| `background-last-used-toggle` | the previous id, for ⌘B | choosing a background |

- Upstream iD only has `background-custom-template` (one string). The fork's list and counter are new.
- `background-last-used*` are rewritten to null when the entry they point to is deleted.
- Display settings (brightness and so on) are the same keys as upstream and are not custom-specific.

### 1.5 The URL (Radnetz fork, read: `modules/renderer/background.js`)

- **Written**: `patchHash` writes `background=custom:<template>` when a custom entry is selected (about line 218).
- **Read**: on load a `custom:` value calls `addOrGetCustomSource`, which **persists** the template in the list (deduplicated) and selects it (about lines 599 to 606). An invalid or empty value is ignored.
- Upstream iD does the same, and also writes its single `background-custom-template` (`.reference/id/modules/renderer/background.js`, about lines 472 to 476).
- **Conflict**: in both, a link writes to storage. Maid's ADR 0009 rule 2 says a link never writes to storage. Maid should not copy this part.

### 1.6 What the fork adds to plain iD (read: both sides)

Plain iD: one custom slot, one template string, a single textarea, Save always enabled, Cancel restores the stored template, the token help is one markdown block, no name, no delete.

The fork adds: a list of entries with names, stable ids and a never-reused counter; edit and delete per row; duplicate merging; the name field; Save disabled while empty; collapsible token help; the licence callout; custom rows sorted first; the delete confirmation; the full template in the tooltip; migration from the single slot.

Status: the fork's `WORKDOC.md` (feature 1) says ✅ and also "Manual browser tests still TODO". Tests that mention custom backgrounds: `test/spec/renderer/custom_backgrounds.ts` (5 tests), `test/spec/renderer/background.ts`, `test/spec/ui/sections/background_list.js`. I did not run them.

---

## Job 1: what Maid has today (Maid, read)

- `packages/module-imagery/src/`:
  - `store.ts`: zustand `persist` under `maid:imagery`, version 1, storage through `moduleStorage()`. Stored fields: `backgroundId`, `overlayIds`, `brightness`. `view` is not stored.
  - `helpers.ts`: a Zod schema (`storedImagery`) where each field falls back to its default with `.catch`. Also sorting, search, zoom visibility, brightness clamp.
  - `ImageryPanel.tsx`: the top-bar flyout "Background" (`topbar.panel`, width `w-96`). Choices, overlays, brightness.
  - `ImageryLayers.tsx`: draws the chosen layers. Returns nothing when `isAutomated()`.
  - `eli.ts`: the only file that calls the ELI package (`@osm-editor-kit/maplibre-editor-layer-index` 0.1.14).
- `grep -i custom` in `packages/module-imagery`, `packages/ui` and `apps/maid/src` finds nothing relevant. The only hit is the todo file `apps/maid/src/id-background_list.test.ts`: three `it.todo`, each marked "needs F-ui-17".
- `docs/build-out/radnetz-features.md`, row 1: "partly: the layer index's backgrounds, overlays and brightness; own backgrounds not built (2026-10-13)". No custom layer is mentioned elsewhere in that file.
- `docs/research/missing-features.md` line 117: "Custom imagery from a URL template (ELI listing only today) | F-ui-17 (3), F-renderer-6 (7) | 10 | M | `packages/module-imagery`". Also `docs/research/id-tests/ui.md` (F-ui-17) and `docs/research/id-tests/svg-renderer-services.md` (F-renderer-6): both todo.
- `apps/maid/src/url/id-url.ts`: `background` and `overlays` are "carried" (kept in a converted link, not acted on). A `background=custom:…` link therefore does nothing in Maid today.
- `docs/adr/0009-decisions-of-2026-10-13.md`: "The 'add custom background layer' feature of the Radnetz fork is wanted in Maid, with the same settings." Rules 2, 3 and 5 of the state section say what a link does (see 2.3).

**Verdict: Maid does not have the feature.** The owner's belief is wrong on this point. Only the ELI list of backgrounds, overlays and brightness exists.

---

## Job 1: how to build it in Maid (proposal)

**UI.** In `ImageryPanel.tsx`, add an "Add custom" button to the Background heading. It opens an inline form inside the flyout (Maid has no modal; the flyout already dismisses on outside click and Escape). Fields: Name (optional), Tile URL template (textarea), tokens help in a `<details>`, Save disabled while the template is empty. A validation message appears in the form, not as a toast. Each custom row gets a pencil and a trash button (Maid's `Tooltip`). Delete asks inline ("Delete X?" with Cancel and Delete). Custom rows come first, in creation order, as in the fork.

**Storage.** Add `custom` to the `maid:imagery` store and bump it to version 2 with a `migrate` step (version 1 has no custom field):
- `custom: { id: "custom-N", name: string, template: string }[]`, validated per entry with Zod `.catch` so one damaged entry is dropped and the rest stay.
- `customCounter: number`, a monotonic counter so ids are never reused (the fork's reason: a stored selection must never point at another layer).
- A custom selection is `backgroundId = "custom-N"`, as the fork does with `background-last-used`.
- This shape matches the fork's entries, so a JSON copy of the fork's list can be pasted in once. Maid should not read the fork's localStorage keys: localStorage is per origin, and I found no sign that the fork and Maid run on one origin. Unchecked: where the fork is deployed.

**URL.** `background=custom:<template>` is read once at start, with a nuqs parser in `apps/maid/src/url/params.ts` (the file that owns Maid's URL parameters). The value is kept in the store, is not part of `partialize`, and so is never written. ADR 0009 rule 3 applies: the link's value holds for the visit, the first change by the person is stored, and the control shows a small mark with a way back to the stored choice.

**Template translation** (ELI's raster specs are already MapLibre-style, so custom templates need their own translation; MapLibre 6.12 is in `node_modules/.bun/maplibre-gl@6.12.0/`):

| iD token (fork and upstream) | MapLibre raster source |
| --- | --- |
| `{zoom}` | `{z}` |
| `{x}`, `{y}`, `{z}` | unchanged |
| `{-y}`, `{ty}` | `{y}` and `scheme: 'tms'`. A source has one scheme, so a template mixing `{y}` with `{-y}` is refused |
| `{@2x}`, `{r}` | `{ratio}` (MapLibre gives `@2x` when the pixel ratio is above 1) |
| `{switch:a,b,c}` | one entry in `tiles` per alternative. MapLibre picks `urls[(x + y) % n]`, the same rule as iD |
| `{u}` | `{quadkey}` (same digit order, checked in MapLibre's source) |
| WMS `{bbox}` | `{bbox-epsg-3857}` (same order: minX, minY, maxX, maxY) |
| `{proj}`, `{wkid}` | literal `EPSG:3857` and `3857` |
| `{width}`, `{height}` | literal `256` |
| `{w}`, `{s}`, `{n}`, `{e}` | no MapLibre token: refuse with a message |

Source settings: `type: 'raster'`, `tileSize: 256`, no `minzoom` or `maxzoom`, so MapLibre overzooms. Strip `#…` from the template and remove newlines.

**Validation** (the fork has only "not empty"): http or https only; at least one of `{z}` or `{zoom}` with `{x}` and `{y}`, or `{quadkey}`/`{u}`, or `{bbox}`; no unknown `{…}` token (name them in the message); a non-empty `{switch:…}` list.

**Tests.** Automated browsers disable the layer (`isAutomated()` in `ImageryLayers.tsx`, and the panel says so). So: unit tests in `bun:test` for the translation, the validation and the Zod store (`helpers.test.ts` is the pattern). Any browser check uses a localhost template (for example `http://localhost:8090/…`, served by the mock API), never a public host.

**Do not copy from the fork:** a link writing to storage (`addOrGetCustomSource`), no validation, and tokens such as keys stored in clear in localStorage. The fork only redacts keys in changeset tags (`imageryUsed`).

---

## Job 2: toasts in tilda-geo (tilda-geo, read)

**Library.** `sonner` **2.0.7**. `app/package.json` lists it under `dependencies` as `"sonner": "^2.0.7"`. `app/bun.lock` pins `sonner@2.0.7` with React 18 or 19 as peers. Installed copy: `app/node_modules/sonner/dist/index.mjs`.

**Mount.** `app/src/components/shared/toast/AppToaster.tsx` (a component that renders `<Toaster>`), mounted once in `app/src/components/layouts/LayoutRoot.tsx` (around line 58). It sits inside `TanStackQueryProvider` and `MotionConfig`, after the route `Outlet` and the footer, before `DevHelpers`.

**Options set:**
- `position="top-right"`
- `richColors`
- `closeButton`
- `toastOptions={{ classNames: { toast: 'font-sans' } }}`

**Defaults left alone** (sonner 2.0.7 source): duration 4000 ms, `theme` light (no `theme` prop), 3 visible toasts, gap 14 px, not expanded.

**Wrapper.** `app/src/components/shared/toast/`:
- `toastError.ts`: `toastError(error, fallback = 'Ein Fehler ist aufgetreten', options?: { id })`. It reads `.message` from an `Error` or from a `{ message }` object (Better Upload), and uses the fallback when the message is empty or `[object Object]`. Covered by `toastError.test.ts` (vitest spies on `toast.error`).
- `toastSuccess.ts`: `toastSuccess(message = 'Gespeichert.')`.
- Exception: `app/src/components/admin/regions/pageRegions/useRegionUploadFile.ts` (lines 31 and 36) calls `toast.error` directly.
- About 25 call sites use the wrapper (for example `toastSuccess('Gelöscht.')` in `app/src/components/admin/regions/PageRegionEdit.tsx`).

**Styling.** No custom component, no `unstyled`. sonner injects its own stylesheet at runtime (`__insertCSS` in its dist). The only class hook is `font-sans` on the toast. `app/src/components/layouts/global.css` has no sonner rules.

**Two call sites as examples:**

1. Mutation with success and error (`app/src/components/admin/processing/ProcessingPrivateHooksSection.tsx`, about lines 33 to 40):
   ```ts
   onSuccess: (result, item) => { toastSuccess(`${item.label}: ${result.message}`) },
   onError: (error, item) => { toastError(error, `${item.label}: Unbekannter Fehler`) },
   ```
2. Error with a stable id, so repeated effects do not stack (`app/src/components/regionen/pageRegionSlug/modes/notes/OsmNotes.tsx`, about lines 10 to 16):
   ```ts
   toastError(error, 'OSM-Hinweise konnten nicht geladen werden.', { id: 'osm-notes-load-error' })
   ```

**Maid.** No toast exists in Maid (grep finds none). ADR 0009, decision 19, is open: "yes, as toasts, with the library tilda-geo uses, in Maid's style and position". Sonner injects its CSS, so Maid's style would use `unstyled` with `classNames` built from Maid's Tailwind tokens, or `toastOptions.classNames`. The position is Tobias's decision.

---

## Not checked

- Neither app was run, and no tests were run in either repo.
- The fork's `WORKDOC.md` says its manual browser tests are still open.
- I did not find where the Radnetz fork is deployed, so I could not confirm whether it shares an origin with Maid.
- The Maid proposal's MapLibre behaviour comes from the installed `maplibre-gl` 6.12.0 source. The `{quadkey}` digit order and the `(x + y) % n` rule were read there, not run.
