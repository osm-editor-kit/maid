# iD tests: ui

Compared at iD commit `0194f3926`. Run: `bun test packages/ui/src/inspector/fields/id-*.test.ts packages/ui/src/id-*.test.ts apps/maid/src/id-*.test.ts` → 56 pass, 0 fail, 59 todo. The whole folders `bun test packages/ui apps/maid` → 404 pass, 0 fail, 64 todo (the other 5 todos are in `apps/maid/src/url/id-hash.test.ts`, not this area).

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `account.js` | 1 | 0 | 0 | 1 | 0 | `apps/maid/src/id-account.test.ts` |
| `cmd.js` | 4 | 0 | 1 | 3 | 0 | `apps/maid/src/id-cmd.test.ts` |
| `combobox.js` | 20 | 0 | 0 | 18 | 2 | `packages/ui/src/inspector/fields/id-combobox.test.ts` |
| `confirm.js` | 10 | 0 | 0 | 3 | 7 | `packages/ui/src/id-confirm.test.ts` |
| `entity_editor.js` | 1 | 0 | 0 | 1 | 0 | `apps/maid/src/id-entity_editor.test.ts` |
| `flash.js` | 1 | 0 | 0 | 0 | 1 | none (see Not applicable) |
| `inspector.js` | 0 | 0 | 0 | 0 | 0 | none (iD's file has one `it.todo('write tests')`) |
| `modal.js` | 6 | 0 | 0 | 2 | 4 | `packages/ui/src/id-modal.test.ts` |
| `multiCombo.ts` | 18 | 0 | 18 | 0 | 0 | `packages/ui/src/inspector/fields/id-multiCombo.test.ts` |
| `view_on_osm.js` | 1 | 0 | 0 | 1 | 0 | `apps/maid/src/id-view_on_osm.test.ts` |
| `sections/background_list.js` | 3 | 0 | 0 | 3 | 0 | `apps/maid/src/id-background_list.test.ts` |
| `sections/raw_tag_editor.js` | 4 | 0 | 0 | 4 | 0 | `apps/maid/src/id-raw_tag_editor.test.ts` |
| `fields/access.js` | 14 | 0 | 12 | 2 | 0 | `packages/ui/src/inspector/fields/id-access.test.ts` |
| `fields/combo.ts` | 3 | 0 | 2 | 1 | 0 | `packages/ui/src/inspector/fields/id-combo.test.ts` |
| `fields/directional_combo.js` | 11 | 0 | 9 | 2 | 0 | `packages/ui/src/inspector/fields/id-directional_combo.test.ts` |
| `fields/localized.js` | 10 | 0 | 3 | 7 | 0 | `packages/ui/src/inspector/fields/id-localized.test.ts` |
| `fields/radio.ts` | 1 | 0 | 1 | 0 | 0 | `packages/ui/src/inspector/fields/id-radio.test.ts` |
| `fields/wikipedia.js` | 10 | 0 | 0 | 10 | 0 | `packages/ui/src/inspector/fields/id-wikipedia.test.ts` |
| **sum** | **118** | **0** | **46** | **58** | **14** | |

Counts are the inventory's (`it(` calls per file). Two things the inventory does not count are in the files and are decided there too: the five-case `it.each` in `fields/radio.ts` (adopted, in `id-radio.test.ts`) and the `it.skip` in `fields/wikipedia.js` (a todo, the 11th in `id-wikipedia.test.ts`).

No logic file was changed. Every adopted test passed against the logic as it stood.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-ui-1 | Combo completes the typed text inline: the first matching option is selected and its unmatched part highlighted; numbers are not completed; `canAutocomplete` and case rules | `combobox.js`: 14 tests (the ones from "selects the first option" to "emits accepted event on ↩") | todo | `fields/combo-logic.ts` (rules) and `fields/Combo.tsx` (display). fields-vs-id.md lists it in step 3 |
| F-ui-2 | Combo keys: Escape cancels with an event, Enter closes the list. The key decisions are inline in `Combo.tsx` and not a pure function | `combobox.js`: 2 tests ("emits cancel event on ⎋", "hides on ↩") | todo | `fields/Combo.tsx`; move the decisions into `combo-logic.ts` |
| F-ui-3 | Combo lists every option when it opens with its text untouched (Maid filters the list by the current text) | `combobox.js`: "shows all entries when activating the combo" | todo | `fields/Combo.tsx` (what text the list filters by) |
| F-ui-4 | Decision: list order when filtering. iD keeps the options' order; Maid ranks label-prefix matches first (`filterOptions`) | `combobox.js`: "filters entries to those matching the value" | todo, needs a decision | `fields/combo-logic.ts` `filterOptions` |
| F-ui-5 | semiCombo shows unique values unless the field allows duplicates. `Field` has no `allowDuplicates`; `semiList` keeps duplicates (a test asserts it) | `combo.ts`: "filters out duplicates by default" | todo | `packages/presets` (Field type and reader), then `fields/multi-logic.ts` `semiList` |
| F-ui-6 | Multi-selection: when selected features differ, the field and the placeholders show "Multiple values". Maid has no multi-selection yet | `access.js`: "sets correct placeholder on a multi selection"; `directional_combo.js`: 2 tests in "handle multiselection" | todo | inspector selection (`packages/ui/src/inspector`, `apps/maid`) |
| F-ui-7 | Access rows (one per key) are built inside `AccessField`, not in a function | `access.js`: "creates inputs for a variety of modes of access" | todo (missing check) | `fields/Access.tsx`; move the row list into `radio-logic.ts` |
| F-ui-8 | Localized: the "Add a language" row and its settle state live in the component | `localized.js`: "adds a blank set of fields when the + button is clicked" | todo (missing check) | `fields/Localized.tsx` |
| F-ui-9 | Localized accepts language names ("Deutsch", "English") as well as codes. Maid's `normalizeLanguageCode` takes codes only. Needs iD's `languages.json` bundled (licence to check) | `localized.js`: 4 tests (value empty; language then value; value then language; changes an existing language) | todo | `fields/localized-logic.ts` and bundled language data |
| F-ui-10 | Decision: emptying a translation's language code. iD removes the translation; Maid refuses with an error (`commitLanguageRow`, asserted by `localized-logic.test.ts`) | `localized.js`: "removes the tag when the language is emptied" | todo, needs a decision (the two expectations contradict) | `fields/localized-logic.ts` `commitLanguageRow` |
| F-ui-11 | The wikipedia field (text, the language and title, the Wikidata id, pasted URLs). Waits for the decision in fields-vs-id.md section 5: it calls the Wikipedia and Wikidata APIs | `wikipedia.js`: 10 tests (+1 `it.skip` in iD) | todo | `packages/ui/src/inspector/fields/` (not built) |
| F-ui-12 | Dialogs are dismissed by their close button, by Escape, and by their action buttons. Only `shouldDismiss` (BottomSheet's drag) is a pure function; the rest needs a browser check | `confirm.js`: 3 tests; `modal.js`: 2 tests | todo (missing check) | `packages/ui/src/BottomSheet.tsx`, `Flyout.tsx`, `apps/maid/src/components/RestorePrompt.tsx` |
| F-ui-13 | Shortcut labels for a shortcut with Shift and no modifier (⇧A → `Shift+A`) and for a key with no modifier (`f11`). `modKey` always adds the platform modifier | `cmd.js`: "changes keys to linux versions", "handles multi-character keys" | todo | `apps/maid/src/platform.ts` (`modKey`) |
| F-ui-14 | Decision: the redo label on Windows and Linux. iD shows `Ctrl+Y`; Maid binds both `Mod+Shift+Z` and `Control+Y` (`useShortcuts.ts`) and labels redo `Ctrl+Shift+Z` | `cmd.js`: "changes keys to win versions" | todo, needs a decision | `apps/maid/src/platform.ts` and the shortcut help |
| F-ui-15 | The inspector has a "View on openstreetmap.org" link (the notes module has one) and the finder for the last modified child of a feature | `view_on_osm.js`: 1 test | todo | `apps/maid/src/components/Inspector.tsx` and a pure finder beside it |
| F-ui-16 | The inspector follows the data when the graph changes under a selected entity (for example a way gets a node and its preset changes) | `entity_editor.js`: 1 test | todo (missing check, browser) | `apps/maid/src/components/Inspector.tsx` |
| F-ui-17 | Custom imagery source with a template (a settings dialog, and a missing source does not crash). Maid's imagery is the ELI listing only | `background_list.js`: 3 tests | todo | `packages/module-imagery` and `apps/maid/src/components/` |
| F-ui-18 | The raw tag list's rules (sorting, the "No tags" state, the add form, the remove button, the commit on blur) are inside `TagList.tsx`, `TagRow.tsx` and `AddTag.tsx`, without a pure function | `raw_tag_editor.js`: 4 tests | todo (missing check) | `apps/maid/src/components/TagList.tsx` and siblings; move the rules to a logic file |
| F-ui-19 | The account button shows the display name as text (today `{auth.user}` in `UserButton.tsx`) | `account.js`: 1 test | todo (missing check, browser) | `apps/maid/src/components/UserButton.tsx` |
| F-ui-20 | The localized value input has a `lang` attribute from the row's code. Maid does not set it; `languageVariants` gives the code | `localized.js`: "has a lang attribute on an existing multilingual name field" | todo | `fields/Localized.tsx` |

## Differences found

- **Combo list order (F-ui-4).** iD shows the matches in the options' order. Maid's `filterOptions` puts label-prefix matches first. This is Maid's choice and it is tested in `combo-logic.test.ts`. Not changed. Tobias to decide which order to keep.
- **Emptied language code (F-ui-10).** iD removes a translation when its code is emptied. Maid refuses the edit and says to use the cross. `localized-logic.test.ts` asserts the refusal, so iD's test and Maid's test cannot both pass. Maid's refusal avoids a silent loss of a translation; iD's removal is what iD users expect. Tobias to decide.
- **Duplicates in semiCombo (F-ui-5).** iD shows unique values unless `allowDuplicates` is set. Maid's `semiList` keeps duplicates, which lets a list remove one of two equal values by index. But `addSemi` always removes duplicates on write, so on a field that allows them, adding a value would also drop the existing repeats. That is a real difference for such fields, not only a display one.
- **Redo label (F-ui-14).** The shortcut works as in iD (both keys), the label differs.
- **Dismissal by Backspace.** iD closes a confirm and a modal on Backspace. Maid does not (see Not applicable).
- **Language names (F-ui-9).** iD takes "Deutsch" and writes `de`. Maid needs `de` typed.
- **Directional empty values.** iD's empty input is `''`; Maid's is `undefined`. The tests compare with `undefined`. Not a difference in what is written.

## Not applicable, by reason

- **D3 widget mechanics** (iD's widget constructor, its sections, its `okButton()` and `close()` APIs, its class names and its DOM placement): `combobox.js` 2 ("adds the combobox-input class", "adds combobox under container"); `confirm.js` 7 ("can be instantiated", three section tests, "can have an ok button added to it", "can be dismissed by calling close function"; plus the Backspace test below); `modal.js` 4 ("can be instantiated", "has a content section", the close-function test, the Backspace test). Maid's dialogs are React components with their own markup and open state (Flyout, BottomSheet, RestorePrompt).
- **Backspace dismisses a dialog** (`confirm.js` 1, `modal.js` 1). Maid does not close a dialog on Backspace: Backspace edits text in every field, so it is not a dismissal key. This is a choice by omission, not a behaviour Maid lacks. Tobias to confirm.
- **Flash messages** (`flash.js` 1): Maid has no transient footer message widget ("flash is shown and goes away"). The brief lists flash messages as absent. Whether Maid wants transient notices is open; see Not finished.

## Not finished

Nothing in the area is unread. Open points for Tobias:

- **Typing `it.todo` in this repo.** The installed Bun typings require a body for `it.todo`, so `it.todo('name')` fails `tsc`. Every todo in my files has a no-op body `() => {}`. The same error is in another area: `packages/validation/src/id-validator.test.ts` line 79 (the one error left in the root `tsc --noEmit`). A repo-wide convention is needed.
- **Platform in `cmd` test.** `id-cmd.test.ts` loads `platform.ts` a second time under a query string, after the navigator is replaced. It works in this Bun version; it depends on Bun caching modules by full specifier.
- **Transient notices (flash).** Decide whether Maid wants them; if yes, `flash.js` gets a feature.
- **Inventory.** `radio.ts` has a five-case `it.each` the counter does not see. `wikipedia.js` has one `it.skip` the counter leaves out. The inventory says `ui` has 2 skipped; this area has 1 `it.skip` (`wikipedia.js`) and iD's `it.todo` in `inspector.js`.
