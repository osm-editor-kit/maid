# @osm-editor-kit/maid-i18n

Maid's own texts (not the preset texts, which come later) in English, German, French and Spanish, with
Paraglide JS 2.25.4. The decisions are in [ADR 0009](../../docs/adr/0009-decisions-of-2026-10-13.md), section Translations.

## Adding or changing a message

1. Add the id to `messages/en.json` and to `de.json`, `fr.json` and `es.json`. Ids are snake_case with
   the area first: `topbar_point`, `sidebar_empty_title`. Variables in single braces: `"Undo: {change}"`.
2. Run `bun run i18n-compile` (every check and dev script runs it too). Run `bun run i18n-check`: it
   fails and names the missing keys in `reports/i18n-missing.json`.
3. Use it: `import { m } from '@osm-editor-kit/maid-i18n'` and call `m.topbar_point()` or
   `m.topbar_undo({ change })`. Call it during render, never at module level (see below).

Plurals, markup and preset texts are not in this step. French and Spanish are drafts: see `REVIEW.md`.

## How the language is chosen

`chooseLocale` (`src/choose.ts`, unit tests in `src/choose.test.ts`): the `lang=` parameter of the address,
then the choice stored in the settings (`lang`, `packages/ui/src/settings.ts`), then `navigator.languages`,
then English. `packages/shell/src/mount.tsx` applies it once, before the first render, with `setLocale`
and `reload: false`. Under automation (`isAutomated()`) it is always English. The top bar's language
select (`packages/shell/src/components/LanguageSelect.tsx`) stores the choice and reloads the page
without the `lang=` parameter. Paraglide itself writes no cookie or localStorage: the locale lives in
memory (`src/strategy.ts`, strategy `custom-maid`).

## What is converted so far

- Top bar: Point, Line, Area and their hints; undo and redo; Save; Log in; the account flyout's
  title, Appearance and the language row; the group labels.
- Empty inspector: "Nothing selected" and its sentence.
- Not yet: the rest of the UI, the theme buttons, the flyout's Log out, headless packages (validation,
  operations, undo labels, which still return English), preset texts.

## Pattern for converting a component

```tsx
import { m } from '@osm-editor-kit/maid-i18n'
// before: <button>Save</button>
<button>{m.topbar_save()}</button>
// before: label={`Undo: ${undoLabel ?? 'last change'}`}
label={m.topbar_undo({ change: undoLabel ?? m.topbar_last_change() })}
// a module-level constant with texts becomes a function that is called in render (see ModeButtons.tsx)
```

Keep the English text unchanged in `en.json` so that the browser checks, which run in English, keep working.

## Texts for a device

Some texts name a way of working: "Hold ⌥ and type a number", "Click a feature", "Press Enter". On a phone they are
wrong. Such a text gets **variants by device** in the message files, so the wording stays with the other texts, in
every language, and the code only passes the device on. No `if (touch)` around texts in components.

The device (`src/device.ts`) has two selectors, set once before the first render (`packages/shell/src/mount.tsx`):

- `input`: `keyboard` when a mouse, trackpad or pen is connected (`any-pointer: fine`), else `touch`.
- `os`: `ios`, `android`, `mac`, `windows` or `other`: for the names of keys and gestures and the system's menus.

A message with variants, in each of `en`, `de`, `fr`, `es` (the inlang message format):

```json
"favourites_intro": [
  {
    "declarations": ["input input", "input key"],
    "selectors": ["input"],
    "match": {
      "input=touch": "Tap a favourite to start it.",
      "input=*": "Hold {key} and type a number to start a favourite."
    }
  }
]
```

The catch-all (`*`) comes last and is the keyboard text. Choose by `os` too (`"selectors": ["input", "os"]`,
matches like `"input=touch, os=android"`) only where iOS and Android really differ. Use it with the device spread into
the values; the type check fails where it is missing:

```ts
import { device, m } from '@osm-editor-kit/maid-i18n'
m.favourites_intro({ key, ...device() })
```

- `bun run i18n-check` fails when a language has other variants than English (`variantMismatch`).
- `src/device-words.test.ts` fails when the text a touch device gets names a key or the mouse ("click", "press",
  "⌥", "Taste", "clavier" …). A text that is right as it is goes into its `ALLOWED` list with the reason.
- `?device=touch`, `?device=ios`, `?device=touch-android` in the address shows a device's texts on another one.
  Under automation the device is a desktop with a keyboard unless the address names one.
- Not a text: a key chip hides on touch with the `touch:hidden` class (`touch:` and `keyboard:` variants from
  `data-input` on `<html>`, `packages/shell/src/styles.css`); a field that focuses itself asks `autoFocusFields()`
  (maid-ui), which is false on touch, except a search.

## A module with texts of its own

A module keeps its texts in its own inlang project and gets its own Paraglide output, so the module can be built
and shipped apart from the app. `packages/module-parking` is the model:

1. `packages/module-*/project.inlang/settings.json` (the same languages and base as the app, plugins from
   `../i18n/node_modules`) and `packages/module-*/messages/{en,de,fr,es}.json`. Keys as above. Add the module's
   `paraglide/` to `.gitignore`.
2. `packages/module-*/src/messages.ts`: link the module's locale to the app's, and export `m`:
   ```ts
   import { linkModuleLocale } from '@osm-editor-kit/maid-i18n'
   import { overwriteGetLocale } from '../paraglide/runtime.js'
   linkModuleLocale(overwriteGetLocale)
   export { m } from '../paraglide/messages.js'
   ```
   The module depends on `@osm-editor-kit/maid-i18n` (workspace).
3. Use `m.<id>()` in the module's code. A label on a module-level object is a getter (`get label() { return m.x() }`),
   so the text is read when it is used, after the page's language is set. Never call `m` at module level.

`bun run i18n-compile` and `bun run i18n-check` pick a module up by its `project.inlang` folder (`packages/i18n/scripts/projects.ts`).
