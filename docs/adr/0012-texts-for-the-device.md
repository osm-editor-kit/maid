# 0012: Texts for the device

Date: 2026-10-29. Asked by Tobias after testing on an iPhone: help texts still talked about keys and clicks.

## Context

Many texts name a way of working: "Hold ⌥ and type a number", "Click a feature on the map", "Press Enter to search".
On a phone they are wrong, and Maid is meant to be used there. Choosing the text with an `if` in each component would
spread the wording over the code, leave the other languages behind, and nothing would notice a new text that forgets
the phone.

## Decision

1. **The device is two values**, detected once before the first render, like the language (`packages/i18n/src/device.ts`,
   `mount.tsx`): `input` (`keyboard` with a fine pointer, else `touch`) and `os` (`ios`, `android`, `mac`, `windows`,
   `other`). An iPad that calls itself a Mac counts as iOS by its touch points. `?device=` in the address overrides it
   for testing; under automation it is a desktop with a keyboard.
2. **The wording lives in the messages**, as Paraglide variants selected by `input` and, where needed, `os`. The
   keyboard text is the catch-all. Callers spread `device()` into the values; Paraglide's types make the call fail
   without it.
3. **Checks keep it so**: `i18n-check` fails when a language has other variants than English; `device-words.test.ts`
   fails when the text a touch device gets contains the words of a keyboard or a mouse, in each language.
4. **What is not a text** follows the same device: key chips hide with the `touch:` Tailwind variant (`data-input` on
   `<html>`), fields focus themselves only with a keyboard (`autoFocusFields()`, a search excepted), the context menu's
   rows are 44 px on touch.

## Consequences

- A new text that names a key or a click fails the unit tests until it has a touch variant or an `ALLOWED` reason.
- The device is fixed for the visit: attaching a keyboard to an iPad changes the texts on the next load.
- Packages without `maid-i18n` (`traffic-sign-field`'s English fallback) are not covered; their hosts pass the texts.
