# Translations for Maid (en, de, fr, es): study

Date: 2026-10-13. Read-only study. No network requests, no file changes in any repository.
Tags: [measured] = counted or read in this session; [inferred] = my reasoning, not checked.
Paths for Maid are relative to the Maid repo root. Paths for tilda-geo are relative to the tilda-geo repo root.

## 1. What tilda-geo really uses

- **No multi-language system.** tilda-geo uses `react-intl` 10.1.17 (`app/package.json`) only as a formatter, with the locale fixed to German. All five `IntlProvider` sites hard-code `locale="de" defaultLocale="de"`: `app/src/components/regionen/pageRegionSlug/SidebarInspector/InspectorFeatureTilda.tsx:45`, `.../InspectorFeatureStaticDataset.tsx:27`, `.../modes/calculator/CalculatorResult.tsx:127`, `.../modes/calculator/CalculatorFilterBar.tsx:53`, `.../modes/qa/detail/QaDetail.tsx:118`. Nothing selects, stores or changes a locale. [measured]
- **Messages are flat TypeScript dictionaries, not JSON, and only German.** Keys look like `sourceId--tagKey--key`, `sourceId--tagKey=value`, `sourceId--title`. Three sources are merged in `app/src/components/regionen/pageRegionSlug/SidebarInspector/TagsTable/translations/translations.const.ts`: `translationsParkingLars.const.ts` (86 hand-written entries), `translationsSources.const.ts` (11 entries), and the generated `app/src/data/generated/topicDocs/inspectorTranslations.gen.ts` (2,348 entries, built by `app/scripts/topic-docs-build/` from `topic-docs/**/*.yaml`). No ICU syntax and no plurals in use. Values can hold a soft-hyphen marker and inline backtick code, rendered by `renderTranslationHtml.tsx`. [measured]
- **How a component reads a string.** Example 1, `TagsTable/translations/InspectorFormattedMessage.tsx`: `const intl = useIntl()` then `const text = intl.formatMessage({ id, defaultMessage })`. Example 2, `SidebarInspector/InspectorFeatureTilda.tsx:45-46`: `<IntlProvider messages={translations} locale="de" defaultLocale="de">` then `<FormattedMessage id={\`${sourceId}--title\`} />`. Only 11 lines in `app/src` use `FormattedMessage`, `useIntl` or `formatMessage`. [measured]
- **Missing keys.** Silent fallback to `defaultMessage` (the raw tag key or value). I read `node_modules/.bun/@formatjs+intl@4.1.17/.../index.js:220` in the tilda-geo install: an error is reported only when there is no `defaultMessage` or when locale differs from defaultLocale. Both are `de`, so nothing is logged. A separate dev aid: `ConditionalFormattedKey.tsx` registers ids with no translation, shown to admins in `.../Tools/ToolsMissingTranslations.tsx`. [measured]
- **Types, lint, tests.** No generated message types (`translations` is `{ [key: string]: string }`), no lint rule for translations, no test file mentions translations. [measured]
- **Scripts.** `app/scripts/TranslationAnalysis/analyze.ts` (`bun run translation-analysis-update` in `app/`) queries the database for real tag keys and values, compares them with `translations`, and writes 29 markdown reports into `app/scripts/TranslationAnalysis/reports/`. It needs a database, so it is not offline. [measured]
- **Docs and agent skills.** Only `topic-docs/README.md` (lines 237-253) describes where generated translations go. The `.agents/skills/add-static-dataset/SKILL.md:126` line names a `translateUtils.ts` helper, which does not exist in the repo. [measured]
- **Locale elsewhere.** Hard-coded German: `Intl` with `de-DE` in `app/src/components/shared/utils/formatNumber.ts`, date-fns `de` in `formatDate.ts` and `relativeTime.ts`, and zod's German messages through `app/src/lib/zodDeLocale.ts` (imported by `app/src/router.tsx` and `app/src/server/db.server.ts`). [measured]

Verdict for the owner's premise: tilda-geo has no translation system to copy. It has German dictionaries for OSM tag labels. Its react-intl is a React-only formatter, so it cannot serve Maid's headless packages (no React there). What is worth borrowing is the conventions: flat dotted ids, English as the source text, a per-key fallback, and a missing-keys report.

## 2. Size of the job in Maid

Method: an AST scan (TypeScript 5.9 parser, read from the Bun cache because the TypeScript 7 npm package has no JS API). Test files excluded. JSX text, user-facing attributes (aria-label, title, placeholder, alt, label, tooltip, hint and similar), label-like object properties (label, name, title, undoLabel, message, description and similar), first arguments of message calls (toast, notify, setMessage, ...), and English-looking string literals. Heuristic; a manual pass would move the numbers by maybe 10 to 20 percent. [measured, heuristic]

Distinct user-facing strings per package (upper bound: strings shared across packages are counted twice, and developer-facing texts are included):

| Package | Distinct strings |
| --- | --- |
| apps/maid/src | 127 |
| packages/ui/src | 76 |
| packages/module-data-layers/src | 46 |
| packages/module-street-imagery/src | 42 |
| packages/validation/src (headless) | 40 |
| packages/operations/src (headless) | 59 |
| packages/module-lenses/src | 24 |
| packages/presets/src (headless) | 20 |
| packages/module-notes/src | 18 |
| packages/renderer/src | 18 |
| packages/module-imagery/src | 17 |
| packages/model/src (headless, mostly developer texts) | 16 |
| packages/module-surface/src | 14 |
| packages/module-traffic-signs/src | 10 |
| packages/filters/src (headless) | 11 |
| packages/journal/src (headless) | 2 |
| packages/core/src | 0 |
| **Total** | **about 540, roughly 450 to 500 user-facing** |

Hard cases [measured]:
- **Template literals in attributes:** about 54 occurrences (apps/maid 10, packages/ui 33, module-street-imagery 6, others 5). Examples: `apps/maid/src/components/TagRow.tsx:44` `aria-label={\`Remove ${tagKey}\`}`; `packages/ui/src/inspector/PresetPicker.tsx:179` `Move ${preset.name} down`; `apps/maid/src/modules/relations.tsx:332` `Remove member ${row.id}`.
- **Hand-written plurals:** `packages/operations/src/operations.ts:111-115` (`n === 1 ? 'Reversed a line' : \`Reversed ${n} lines\``), repeated for split, straighten, square, extract, flip, delete. About 13 to 14 in operations. In Maid: `apps/maid/src/components/MapContextMenu.tsx:39` `Here: ${features.length} features`; `apps/maid/src/components/Inspector.tsx:82` `${ids.length} features selected`; `apps/maid/src/components/RestorePrompt.tsx:15` `1 unsaved edit`.
- **Undo labels in headless code:** 31 lines with `annotation` or `undoLabel` across packages/operations, packages/core and apps/maid. Examples: `packages/operations/src/point-to-area.ts:108` `'Turned a point into an area'`; `operations.ts:232` `Merged ${ids.length} lines`. The engine side: `apps/maid/src/components/UndoRedo.tsx:15` `Undo: ${undoLabel ?? 'last change'}`, plus `Nothing to undo`. Undo labels end up in the journal, so they must become data, not translated text.
- **Validation messages (headless):** `packages/validation/src/rules/crossing-ways.ts:175` `${labelOf(first)} crosses ${labelOf(second)} without a junction`; `rules/private-data.ts:78` `A private building (building=${building}) has personal contact data: ${keys.join(', ')}`; `rules/private-data.ts:43` `Remove ${list}`; rule and fix labels such as `'Crossing ways'`, `'Delete this feature'`.
- **English fallbacks in code:** `packages/presets/src/presets.ts:37-40` ('Point', 'Line', 'Area', 'Relation'); `packages/ui/src/inspector/fields/Access.tsx:8` (row labels copied from iD); `packages/ui/src/inspector/fields/address-formats.ts` (English placeholders); `apps/maid/src/components/BottomDock.tsx:13-15` ('Nodes', 'Ways', 'Relations', `toLocaleString('en')`), and `packages/ui/src/FilterPanel.tsx:85` (`toLocaleString('en')`).
- **Test and check coupling:** 179 test files; about 127 assertion lines compare against English literals (grep, approximate). `tools/bench` has 26 lines with role, text, label or aria-label queries (`interactions-check.ts` 14, `validation-check.ts` 6, `journal-check.ts` 3, `relations-check.ts` 1, others).

Preset and field data, the other big part [measured, from `packages/presets/node_modules/@openstreetmap/id-tagging-schema` v6.19.2, ISC]:
- `dist/translations/` holds 134 locales, each as `.json` and `.min.json`, about 40 MB in total. Four are needed: `en`, `de`, `fr`, `es` (`.min.json`).
- English (`en.min.json`, top key `en`, sections `presets.presets`, `presets.fields`, `presets.categories`): 6,024 text leaves. 1,682 preset names, 1,279 preset terms, 128 aliases, 695 field labels, 110 field placeholders (address), 1,897 option labels, 17 categories.
- Coverage against en (leaves present): de 98.0% (119 missing), fr 96.0% (238 missing), es 97.8% (130 missing). Sample of missing fr presets: `shop/ice_cream`, `playground/pump`. Terms and aliases exist only for some locales, so de has 580 extra leaves that en lacks. Nothing is empty.
- Sizes, minified, per locale: en 263,810 bytes (gzip 77,687); de 296,368 (92,466); fr 288,484 (85,402); es 340,825 (102,710). I did not measure a reduced variant without placeholders and aliases; my quick test with terms kept showed no real saving.
- Maid's own UI and validation strings: about 500 strings, roughly 25 KB raw per language [inferred: 500 times about 50 bytes].

## 3. How the presets package reads names today

- `packages/presets/src/default.ts` statically imports `dist/translations/en.min.json` (line 5), together with `presets.min.json`, `fields.min.json` and `discarded.min.json`. [measured]
- `presets.min.json` holds only 49 `"name"` occurrences, so names and labels come from the translation file. [measured]
- `presets.ts:54-55` `translationSection()` reads the `en` key. Names: `textOf(presetNames, id, 'name')` (line 449), falling back to the raw name. Field labels and options: lines 369-391 and 429 (`optionText`). Terms: `wordList(textOf(presetNames, id, 'terms'), ',', raw.terms)` (line 502). [measured]
- `presets.ts:18-19` says the iD localizer is "not ported (labels come straight from the English translation)". So a fallback chain is new work, not a config change. [measured]
- Changes needed: `PresetData.translations` takes the locale's object (same shape as today, so the code barely changes); `createPresets` takes a locale and an English fallback; `default.ts` becomes an async loader; `types.ts` comments (lines 9-10, 36-37, 65) change; presets tests stay on English. [inferred]

## 4. Feasibility and proposed design

**Verdict: feasible.** The transform itself is easy (four JSON files, about 1.2 MB in total, reshaped in milliseconds [inferred]). The real work is:
1. about 500 inline strings to move into keys, including about 54 template attributes and about 14 hand-written plurals;
2. headless packages returning message descriptors (`{ id, values }`) instead of English text, because undo labels and validation messages are stored or compared as data (operations, validation, journal);
3. 127 English assertions and 26 browser queries, which must be pinned to `?locale=en`;
4. translation quality for de, fr and es, which needs a reviewer.
Main risk: point 2, because it changes data shapes that the journal and the undo history persist. Second risk: fr and es text with no native reviewer.

**Registry layout (Maid).**
```
packages/i18n/                      headless: createTranslator(locale, tables), t(id, values); {name} interpolation;
                                    plurals via Intl.PluralRules (built in, no dependency); fallback locale -> en per key
packages/i18n/tools/build-presets.ts   the transform (run by scripts, not by the app)
apps/maid/src/i18n/messages/<lang>/ui.json, validation.json, operations.json   hand-written, committed
apps/maid/src/i18n/generated/<lang>/presets.json                              generated, git-ignored
i18n/keys.gen.ts                    key union from en/*.json, so t('ui.typo') fails type-check
```
Keys: flat dotted ids (`ui.undo`, `operations.reverse.lines.one` / `.other`). Preset and field ids keep the id-tagging-schema form.

**Transform script** (`bun run i18n-build`).
- Input: `packages/presets/node_modules/@openstreetmap/id-tagging-schema/dist/translations/{en,de,fr,es}.min.json`. Reads only node_modules: offline, no network.
- Keeps: `presets.presets` (name, terms, aliases), `presets.fields` (label, options, terms, placeholders), `presets.categories`. Drops: the other 264 locale files and the non-min copies. Output shape stays `{ presets: {...} }`.
- Writes one JSON per language and a coverage report (`reports/i18n/coverage.json`, see below).
- Runs in root `postinstall` (so `bun install` and CI produce it before type-check) and in `predev`. Under a second [inferred]. Do not rely on bunfig: `bunfig.toml` only sets `minimumReleaseAge` (5 days) and the linker, not lifecycle scripts. Root `package.json` has no `postinstall` or `predev` today. [measured]. Bun runs a root's own `predev` before `bun run dev` and root `postinstall` on install [inferred from Bun's documented behaviour; not run here].

**Headless packages.** They import no React and no JSON. Annotations and validation messages return descriptors `{ id, values }`; the UI resolves them with a translator passed in by `createEditor` (core) or by the shell. Tests assert ids. English text stays as the fallback table.

**Language choice.** Order: `?locale=` URL parameter, then a stored choice (localStorage, try/catch, per viewer), then `navigator.languages` matched to {en, de, fr, es}, then en. Maid already maps iD's `locale` parameter as carried in `apps/maid/src/url/id-url.ts:30`, so `?locale=de` fits the existing parser table in `apps/maid/src/url/params.ts`.

**Bundle.** `import.meta.glob` (or an explicit map) per language, so Vite emits one chunk per language. Load the selected chunk before the first render, so no English flash. Non-English users download about 90 to 100 KB gzip more. en can stay eager.

**Tests and checks.** Vitest defaults to en. Browser checks and `tools/bench` pin `?locale=en`, so the 26 English queries keep working. A new `bun run check-i18n` loads `?locale=de`, asserts a few German labels, and fails on English leaks. Expose `window.__maid.i18n` with the active locale and the missing ids.

**Agent workflow for translations.**
- `bun run i18n-missing` writes `reports/i18n/missing-<lang>.json`: `[{ key, en, placeholders, context }]`, in batches of about 80 keys.
- An agent writes `reports/i18n/batches/<lang>-NNN.json`; `bun run i18n-merge` validates (same `{name}` tokens, complete `one`/`other` plural pairs, no markup) and writes `messages/<lang>/*.json`.
- `bun run check` includes `i18n-check`: key parity with en, placeholder parity, unused keys. Per AGENTS.md: Haiku at high effort for drafts, and a native or Tobias review before release.

## 5. Open questions for the owner

1. **Source of de, fr, es for presets and fields.** (a) Read id-tagging-schema's translations as shipped, pinned to a version: 96 to 98 percent complete, human-made, from iD's Transifex project (Maid consumes, never uploads). (b) Keep a copy in the repo. (c) Translate all about 6,000 preset and field strings ourselves. **Recommendation: (a)**. It conflicts with the wording "no community translation platform" only if that is meant to cover upstream data; please confirm.
2. **Which strings are in the first pass.** UI only, or also validation and operations (undo labels). **Recommendation: all about 500 at once**, because the descriptor change is the costly part.
3. **Who reviews translations.** Tobias reads German. French and Spanish: (a) agent drafts, marked unreviewed in the registry; (b) a native reviewer before release; (c) no French or Spanish UI at first. **Recommendation: (a) with a flag, then (b).**
4. **Language choice.** URL parameter only; a setting in the top bar; browser language. **Recommendation: all three, in the order given in section 4.**
5. **Default language for a new visitor.** English or German. The tool is German-run, but the request is for four languages. **Ask.**
6. **Plurals.** Simple `{name}` with `one`/`other` via `Intl.PluralRules` (zero dependency, **recommended**), or ICU MessageFormat via a library as tilda-geo's react-intl does (dependency and bundle size not measured).
7. **Search by term.** Match the chosen locale's terms only, or also English. **Recommendation: both**, so English muscle memory keeps working.
8. **Generated registry.** Git-ignored and generated in postinstall and predev (**recommended**, small diffs), or committed (reviewable, no install step, about 1.2 MB of diff per upstream upgrade).
9. **Upstream version.** Pin exactly (**recommended**, with a stamp file), or keep the current `^6.11.0` range (6.19.2 installed).
10. **Docs decision.** `docs/research/missing-features.md` lines 175 and 197 say editor translations are "not planned". Record the new decision in `docs/adr/`.
11. **Number and date formats.** Follow the chosen locale (**recommended**), replacing the hard-coded `'en'` in BottomDock and FilterPanel.
