# Paraglide JS for Maid: study

Date: 2026-10-13. Read-only research. No repository was edited. No request went to OpenStreetMap services. npm registry dates were not checked.

Tags used on every statement:
- **[docs: page]** read in the official Paraglide docs (paraglidejs.com, or the GitHub README, or an npm package README where stated).
- **[local: repo, path]** read in a local checkout. Paths are relative to the named repo root.
- **[search]** only in a web search summary, not in the page itself.
- **[inference]** my reasoning, not checked by running code.

Repos named: `osm-traffic-sign-tools`, `parking-lanes`, `tilda-geo`, `tilda-geo-traffic-signs`. Sibling checkouts of the traffic-sign repo are named by their folder names (`osm-traffic-sign-tools-id-field`, `-parking-signs`, `-qa-issues`).

Docs read: live fetches on 2026-10-13. No docs page showed a publication date. The changelog's newest entry is 2.27.0 [docs: changelog].

---

## 0. Correction to the earlier study

- The tilda-geo claim is confirmed. [local: tilda-geo, app/package.json] `react-intl` 10.1.17. [local: tilda-geo, app/src/components/regionen/pageRegionSlug/SidebarInspector/InspectorFeatureTilda.tsx:45, InspectorFeatureStaticDataset.tsx:27, modes/calculator/CalculatorFilterBar.tsx:53] `IntlProvider locale="de" defaultLocale="de"`. No locale switch exists in `app/src` (grep for `setLocale`, `changeLocale`, locale in localStorage: no hit). The same holds in `tilda-geo-traffic-signs`.
- tilda-geo does **not** use Paraglide. [local: tilda-geo] No `project.inlang`, no `@inlang/paraglide-js` in any `package.json`, no Paraglide in the working tree. `git log --all -S paraglide` and `-S inlang` return no commit in tilda-geo or in tilda-geo-ARCHIVE. The FMC and NPM folders contain no `project.inlang` and no Paraglide dependency.
- The owner's premise "his other projects use Paraglide" is true for two repos, not for tilda-geo: `osm-traffic-sign-tools` (apps/traffic-sign-tool) and `parking-lanes` (app/).

---

## 1. Job 1: where Paraglide is used locally

| Repo (folder) | Paraglide version | Base locale, locales | Message files | Compiled output |
| --- | --- | --- | --- | --- |
| osm-traffic-sign-tools, apps/traffic-sign-tool | lock 2.25.4; range ^2.25.4; paraglide-js-react 1.0.3 | en; en, de | messages/en.json, messages/de.json, 309 keys each | paraglide/ (ignored) |
| osm-traffic-sign-tools-id-field, apps/traffic-sign-tool | range ^2.25.4 | (same file layout) | | |
| osm-traffic-sign-tools-qa-issues, apps/traffic-sign-tool | range ^2.25.4 | (same) | | |
| osm-traffic-sign-tools-parking-signs, apps/traffic-sign-tool | range ^2.18.1 | (same) | | |
| parking-lanes, app/ | lock 2.22.0; range ^2.20.2; no React adapter | de; de, en | app/messages/de.json, en.json, 432 keys each | app/paraglide/ (ignored) |

Sources for the table: [local: osm-traffic-sign-tools, apps/traffic-sign-tool/package.json, bun.lock, project.inlang/settings.json, messages/*.json] and [local: parking-lanes, app/package.json, bun.lock, project.inlang/settings.json, messages/*.json]. The sibling checkouts were read for their `package.json` and `vite.config.ts` only.

### 1a. osm-traffic-sign-tools (apps/traffic-sign-tool)

- **settings** [local: apps/traffic-sign-tool/project.inlang/settings.json] (tracked): `baseLocale: "en"`, `locales: ["en","de"]`, modules `@inlang/plugin-message-format` and `@inlang/plugin-m-function-matcher`, `"plugin.inlang.messageFormat": { "pathPattern": "./messages/{locale}.json" }`.
- **Messages** [local: messages/en.json]: inlang message format with `$schema`. Flat snake_case keys (`lang_switcher_button`). Variables in single braces (`{trafficSignTag}`, `{from}`). Markup is used once or more: `"{#link to=|https://wiki.openstreetmap.org/...|}the Wiki ...{/link}"`. No plural or select syntax in either file.
- **Vite** [local: vite.config.ts]: `paraglideVitePlugin({ project: './project.inlang', outdir: './paraglide', strategy: ['localStorage', 'baseLocale'] })`. The source comment says: "UI locale only — no `url` strategy (our `/$lang` param is catalogue, not UI lang)."
- **Scripts** [local: package.json]: `"build:paraglide": "paraglide-js compile --project ./project.inlang --outdir ./paraglide --strategy localStorage baseLocale"`. `"build": "bun run build:paraglide && bun run build:vite"`. `"dev": "vite"` (no separate compile; the Vite plugin compiles). `"type-check": "tsc --skipLibCheck --noEmit"`. `"test": "vitest run --passWithNoTests"`. Dependencies: `@inlang/paraglide-js ^2.25.4`, `@inlang/paraglide-js-react ^1.0.3`. Dev: `@inlang/plugin-message-format ^4.4.4`, `@inlang/plugin-m-function-matcher ^2.2.16`.
- **Output** [local: paraglide/]: `messages/`, `messages.js`, `registry.js`, `runtime.js`, `server.js`, `README.md`, `.gitignore` (contains `*`). Not tracked by git (`git ls-files` shows no `paraglide/` or `src/paraglide/`). `project.inlang/.gitignore` ignores everything except `settings.json`; its own comment says inlang writes it.
- **Calls** [local: src/]: 16 files import `* as m from '@app/paraglide/messages'`. Several are plain TypeScript modules with no React: `src/features/i18n/catalogueLabels.ts`, `geometryLabels.ts`, `focusLabels.ts`, `questionLabels.ts`, `signCategoryLabels.ts`, and `src/features/seo/seoHead.ts`. One TSX file uses `ParaglideMessage` from `@inlang/paraglide-js-react`: `src/features/validation/ConditionalOpeningHoursValidationFeedback.tsx`.
- **Locale switch** [local: src/routes/__root.tsx, and a `useUiLocale` hook]: the root route reads the locale from the app and renders the shell with `key={uiLocale}`. The comment says: "Remount app shell so Paraglide `m.xxx()` re-runs (Compiler + external locale store)."
- **Tests** [local: vitest config, src/**/*.test.*]: vitest with jsdom. No test sets or pins a locale.
- **Agent docs** [local: the worktree under .claude/worktrees/…/.cursor/skills/update-sign-questions/SKILL.md line 49]: the skill tells the agent to run `bun run build:paraglide`. No translation guide exists in the main repo's AGENTS.md, docs or .cursor folders.

### 1b. parking-lanes (app/)

- **settings** [local: app/project.inlang/settings.json]: `baseLocale: "de"`, `locales: ["de","en"]`, same two plugins and `pathPattern`.
- **Messages** [local: app/messages/en.json]: 432 keys each. Flat snake_case keys. Variables such as `{modeLabel}`, `{count}`, `{host}`. No plural syntax. Where a count matters, the copy avoids it: `"Set \"{key}\" to \"{value}\" on {count} segment(s)"`. No markup.
- **Vite** [local: app/vite.config.ts]: same plugin with `strategy: ['localStorage','baseLocale']`.
- **Scripts** [local: app/package.json, root package.json]: `build:paraglide` runs the same CLI command. Root `ensure-paraglide` runs `build:paraglide`. Root `type-check`, `test-run`, `check`, `check-ci` and `check-pre-push` each run `ensure-paraglide` first. The app's `predev` does not compile (it fetches a style and writes a fixture). So compile happens two ways: the Vite plugin on dev and build, and an explicit script before type-check and tests, because `bun test` does not run Vite.
- **Output** [local: app/paraglide/.gitignore contains `*`; app/project.inlang/.gitignore ignores all but settings.json]: not tracked.
- **Compiled output** [local: app/paraglide/messages/save_upload_n_changes.js, compiled with 2.22.0]: each message module contains one function per locale (`de_…` and `en_…`). The selector is `experimentalStaticLocale ?? options.locale ?? getLocale()`. Every locale other than `de` returns the English branch. So all locales are inside every message module.
- **Compiled runtime** [local: app/paraglide/runtime.js]: `setLocale` default `reload: true`. It also exports `experimentalStaticLocale` and `experimentalMiddlewareLocaleSplitting`.
- **Locale sync** [local: app/src/i18n/useUiLocale.ts]: the URL search param `locale` is the source of truth. `useUiLocale()` calls `setLocale(uiLocale, { reload: false })` during render when the value differs. `useSetUiLocale()` updates the URL with `replace: true`. `app/src/modes/width/measure-guide/WidthAuditPage.tsx` keys its subtree on the locale so it remounts.
- **Headless packages avoid Paraglide** [local: packages/street-imagery/src/i18n/index.ts; packages/street-imagery-react/src/i18n/]: `STREET_IMAGERY_LOCALES = ['en','de']`, own message tables, date-fns locales, and a React context provider in the react package. The plan file [local: .cursor/plans/lanes_3-column_explore_*.plan.md line 341] says: "No i18n: labels in the scene are OSM values or numbers; user-facing text is the app's job (paraglide)."

### 1c. tilda-geo and the other FMC and NPM checkouts

- No Paraglide anywhere (see section 0). [local: tilda-geo, tilda-geo-traffic-signs, tilda-geo-ARCHIVE-…]
- The owner's skills folder (`~/.claude/skills`, 33 skills) contains no file that mentions Paraglide or inlang. [local: skills folder, grep]
- Verdict: Paraglide is used in two repos, with the same setup in both. The first pattern is from the traffic-sign tool. The second is parking-lanes, which is further along and uses the locale-in-URL sync.

---

## 2. Job 2: Paraglide JS as documented

### 2.1 How it works
- The compiler reads an inlang project (`project.inlang/settings.json` plus message files) and emits ESM: `messages.js` with one function per message, and `runtime.js` with `getLocale`, `setLocale`, `locales` and `strategy`. [docs: home; basics]
- A message call looks like `m.greeting({ name: "World" })` and returns a `LocalizedString`. [docs: vanilla-js-ts; basics]
- Tree-shaking: "Vite's Rollup-based tree-shaking eliminates unused messages automatically." [docs: architecture]
- Keys must be literal: a runtime key `m[\`${name}_label\`]` "can't be resolved", and the docs say it weakens the unused-message check. [docs: basics; message-keys]
- Locale switching "uses a full document navigation, not framework reactivity." [docs: basics; README]

### 2.2 Message file format
- Plugins: inlang message format (`messages/{locale}.json`), i18next (`locales/{locale}.json`), plain JSON (`{locale}.json`). Plugins are listed in `settings.json` `modules`. [docs: file-formats]
- Variables: `"Welcome to {appName}, {username}!"`. [docs: file-formats]
- Markup: `"cta": "{#link to=|/docs| @track}Read docs{/link}"`. `{#tag/}` is standalone. Options: `name=|literal|` or `name=$variable`. Attributes: `@track`. Plain JSON files can hold markup. Rendering: a React component `ParaglideMessage` with a renderer per tag, or `m.cta.parts({})` for your own output. [docs: markup; README]
- Plurals: **the docs contradict each other, and the question is open.**
  - The variants page: `declarations` such as `"input count"` and `"local countPlural = count: plural"`, `selectors`, and match keys like `countPlural=one` with `*` as catch-all. Plural category comes from `Intl.PluralRules`. An exact number needs an alias selector (`countPluralExact = count`) placed before the plural selector. Offset (`plural offset=1`) and ordinals (`type=ordinal`) exist. [docs: variants]
  - The file-formats page gives an ICU-style example: `"items_count": "{count, plural, one {# item} other {# items}}"`. [docs: file-formats]
  - The 2.27.0 changelog says variants are now chosen in "MessageFormat 2 preference order", that `#` from "ICU MessageFormat 1 imports" renders locale-formatted numbers, and that a local reading an input with no `input` declaration "now fail[s] to compile." [docs: changelog]
  - Action: compile one test plural in a scratch project before relying on either form.
- Message inputs are loosely typed in the compiled output: `{ count: NonNullable<unknown> }` [local: parking-lanes, app/paraglide/messages/save_upload_n_changes.js]. The docs do not document parameter typing.
- Keys: a key becomes the generated function name. For new messages the docs recommend random, meaningless keys (`penguin_purple_shoe`) so renames do not break references, and say existing keys should not be renamed to match this style. Flat keys are recommended; dotted keys are supported. [docs: message-keys]

### 2.3 CLI and Vite plugin
- CLI: `npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emit-ts-declarations`. Flags: `--watch`, `--no-emit-ts-declarations`. [docs: compiling-messages]
- The compile page does not list `--strategy`, yet both local repos pass it [local: both repos' `build:paraglide`]. Compiler option names are in `compiler-options`, below.
- Vite plugin: `paraglideVitePlugin({ project, outdir, emitTsDeclarations, experimentalPerLocaleBuild })`. Bundler plugins recompile automatically when translation files change, and the docs recommend them over the CLI. [docs: compiling-messages; vite]
- Options can also live in `project.inlang/paraglide.config.js` (added in 2.25.0). [docs: vite; changelog]
- Compiler options and defaults [docs: compiler-options]: `strategy` default `["cookie","globalVariable","baseLocale"]`; `cleanOutdir` true; `emitGitIgnore` true; `emitReadme` true; `outputStructure` default `"message-modules"` (or `"locale-modules"`); `cookieName`, `localStorageKey` default `'PARAGLIDE_LOCALE'`; `trailingSlash` (unset keeps old behaviour); `routeStrategies`; `urlPatterns`; `disableAsyncLocalStorage`; `includeEslintDisableComment`.
- Committing output: the docs do not say whether to commit it. The output directory ships its own `.gitignore` by default (`emitGitIgnore: true`). Both local repos ignore it.
- Network: no docs page says whether compile needs network. [inference: it reads local files only]

### 2.4 Locale strategies and order
- Values: `url`, `cookie`, `localStorage`, `preferredLanguage`, `baseLocale`, `globalVariable`, and `custom-<name>` via `defineCustomClientStrategy()` / `defineCustomServerStrategy()`. [docs: strategy]
- `url` reads the locale from the path with URLPattern. It is not a query-string strategy. [docs: strategy]
- `localStorage` is skipped on the server. [docs: strategy]
- `preferredLanguage` reads `navigator.languages` on the client; exact match first, then base language. [docs: strategy]
- `baseLocale` is "typically used as a final fallback." [docs: strategy]
- `globalVariable` is "for testing or quick starts" only. [docs: strategy]
- Order: the array is a fallback chain; the first strategy that returns a locale wins. Always-resolving entries go last. Example from the docs: putting `preferredLanguage` before `localStorage` means the stored choice never takes effect. [docs: strategy]
- Error "No locale found": raised when the array is empty, when `overwriteGetLocale`/`overwriteSetLocale` is not called at the entry point, and similar. [docs: errors]
- Changelog 2.25.4: trailing-slash default changed; without `trailingSlash`, `/about/` becomes `/en/about/`. [docs: changelog]

### 2.5 getLocale, setLocale, reload
- `getLocale()` is what messages use. `setLocale()` is what apps call. Both can be replaced with `overwriteGetLocale` / `overwriteSetLocale`. Client and server have separate runtimes. [docs: strategy]
- Default `setLocale()`: "updates the selection through your configured strategies and performs a full document navigation." [docs: home]
- `setLocale(locale, { reload: false })` is described as "a narrow browser-only escape hatch for fully client-rendered, non-URL surfaces." The README says it "transfers all reactive and document-state updates to the application." [docs: home; README]
- Unknown locale passed to `setLocale`: not documented. [docs: none]
- Per-call locale: the compiled message accepts `options.locale` [local: parking-lanes, app/paraglide/messages/save_upload_n_changes.js]. The docs pages read do not mention it. [inference: it is usable, but not documented]

### 2.6 Plain TypeScript without a framework
- Yes, documented: install, compile, then `import { m } from "./src/paraglide/messages.js"` and `import { getLocale, setLocale } from "./src/paraglide/runtime.js"`. No provider. [docs: vanilla-js-ts]
- The page does not say explicitly that non-React modules may call messages. Its examples are plain modules. [inference from the example]
- Local: the traffic-sign tool calls message functions from plain TS modules (section 1a). [local]

### 2.7 Monorepo guidance
- **Pattern 1 (recommended by the docs):** one `project.inlang` at the root. Each consuming package runs `compile` against it and writes to its own `src/paraglide`, so each can use its own strategy. [docs: monorepo]
- **Pattern 2:** a shared i18n package with its own `project.inlang`, compiled once in a build script and exported as `./messages` and `./runtime`. "All consuming packages must use the same locale detection strategy since compilation happens once." The docs say not to switch to Pattern 2 just to share UI copy. [docs: monorepo]
- **Shared UI packages:** either accept translated strings as props, or compile the UI package with `--strategy baseLocale` and call `initUiI18n()` once per app entry. [docs: monorepo]

### 2.8 Per-locale code splitting and bundle size
- Default: every locale is in every message module (confirmed in the compiled output, section 1b). [local]
- `outputStructure: "locale-modules"`: one module per locale. [docs: compiler-options]
- `experimentalStaticLocale`: a compile-time constant that allows per-locale tree-shaking. Marked experimental. [docs: compiler-options]
- `experimentalPerLocaleBuild: true`: Vite 8+ backend only. One Rolldown client environment per locale, output in `<outDir>/__paraglide/<stable-locale-id>/` with a `paraglide-vite-locales.json` manifest. It needs `locale-modules` and full-document navigation for switching. It does not work with TanStack Start or SvelteKit yet. [docs: compiling-messages]
- `experimentalMiddlewareLocaleSplitting`: SSR and SSG only; "not for production." [docs: compiler-options]
- Size claim: "Expect up to 70% smaller i18n bundle sizes" than runtime libraries. The example is 47 KB against 205 KB for five locales and 200 messages, labelled a benchmark. [docs: home]
- No per-locale size figures are given. [docs: none]

### 2.9 Type safety
- Message functions return `LocalizedString`, a branded string type. [docs: basics]
- After a key is renamed, stale calls fail type-check. [docs: message-keys]
- Nested keys: a union type such as `type NavKey = "nav.home" | "nav.about"` with bracket access. [docs: message-keys]
- `emitTsDeclarations` generates `.d.ts` files and needs TypeScript 5.6 or newer. [docs: compiling-messages]
- Parameter types: not documented (see 2.2 on the loose compiled inputs). [local]

### 2.10 Fallbacks for missing translations
- The docs pages read (basics, errors, architecture) say nothing about a missing translation for the active locale. [docs: none]
- Local evidence in a two-locale project: any non-German locale falls to English. [local: parking-lanes compiled output]
- Four-locale fallback behaviour: not checked. [needs a scratch compile]

### 2.11 Tooling the docs recommend

| Tool | What the docs say | Offline / CI | Sends text out? | Fit for Maid |
| --- | --- | --- | --- | --- |
| `inlang check` (CLI) | Finds missing or empty translations, missing or unknown variables and markup, missing plural forms, and unused messages (needs m-function-matcher 2.3.0 or later). Flags: `--unused-messages`, `--source ./src`, `--locales de,fr`, `--format json`, `--no-fail`. Exits 1 on findings. [docs: checking-translations] | CI: yes, documented example. Offline: not stated, but it reads local files. [inference] | No | **Fits, with this work** (check version: see below) |
| `@inlang/cli` 3.2.0 README | Lists `validate`, `machine translate`, `plugin build`, `lint`, `project`, `open`, `module`, `help`. It does **not** list `check`. [docs: unpkg @inlang/cli@3.2.0 README] | | | Conflict: check the version actually installed |
| `lint` | Deprecated; "does nothing and exits with 0." [docs: checking-translations] | | | No |
| `validate` | Deprecated. [docs: checking-translations] | | | No |
| `machine translate` | Default provider is **Google Translate**, which needs `INLANG_GOOGLE_TRANSLATE_API_KEY`. DeepL with `INLANG_MACHINE_TRANSLATE_PROVIDER=deepl` and `INLANG_DEEPL_API_KEY`. `--force` for pipelines. The README advises running it only in build pipelines. [docs: unpkg @inlang/cli@3.2.0 README] | Needs network and a key | **Yes, sends text to Google or DeepL** | **Does not fit** (external service; owner rules). A search summary said the default is a free inlang service; the README says otherwise. I trust the README. [search: conflict noted] |
| Sherlock (VS Code extension) | Shows translations inline in code, extracts hardcoded strings, flags missing translations. Needs a git repo, VS Code 1.84+, Node 18+. [search: inlang app pages; not fetched directly] | Editor, local | Not stated | Optional for developers |
| Fink | "Localization editor for translators", no-code, repository-based. [search; not fetched directly] | Not stated | Likely a hosted web app [inference] | Does not fit (team uses repo and agents) |

Other recommended features, one line each:
- Compiler and Vite plugin: fits, with this work (a compile step).
- Message format plugin plus m-function-matcher: fits (needed for `check`).
- Locale strategies: fits. URL-in-query needs a custom sync (parking-lanes pattern).
- `ParaglideMessage` markup: fits only for rich help text; Maid has little.
- Plurals: fits, but the syntax is unresolved; avoid in step 1.
- `url` strategy and `routeStrategies`: does not fit (Maid's locale is a query parameter; both local repos avoid `url` for the same reason).
- Middleware and SSR features: do not fit (client-only app).
- `experimentalPerLocaleBuild`: does not fit now (experimental; full-document navigation).
- `outputStructure: "locale-modules"`: possible later, not needed.

---

## 3. Job 3: fit for Maid

**3a. Headless packages calling message functions: with this work.**
- Technically yes. Compiled functions are plain ES modules, and the traffic-sign tool already calls them from plain TS modules [local]. The docs describe no framework dependency for messages [docs: vanilla-js-ts].
- Today `packages/validation` and `packages/operations` return finished English strings. With Paraglide they would return a `LocalizedString` computed from the global locale at call time.
- A stored finished sentence is **not acceptable** for journal entries or undo labels that are shown later, possibly after a language switch. Store a message id plus values and render at display time. [inference]
- Paraglide has no lookup by a dynamic id. The docs' position: "For dynamic menu systems, create an explicit mapping from domain values to generated message functions." [docs: message-keys]. Maid needs its own id-to-function map in the app, typed from the message module (`keyof typeof m`). [inference]
- Recommendation: headless packages import no Paraglide code. They return descriptors `{ id, values }`, and the app resolves them. [inference]

**3b. Preset texts (about 6,000 per language) compiled into Paraglide: no.**
- About 24,000 functions would be generated, and each module carries every locale (section 1b). The whole preset set would ship to every user. [local + inference]
- Preset lookup is by dynamic id. Tree-shaking cannot remove what the code cannot name, and the unused-message check breaks. [docs: basics; message-keys]
- Preset ids such as `shop/ice_cream` or `amenity/cafe` are not valid function names. [inference]
- **Alternative:** a JSON registry per language produced by a transform script from `@openstreetmap/id-tagging-schema`, loaded with dynamic `import()` for the active locale. [inference]
- How it sits next to Paraglide: the locale value comes from one source, `getLocale()` (or Maid's locale store). The presets package takes the locale as a parameter and never imports Paraglide.
- Switching the language: with Paraglide's default reload, nothing else is needed. With a live switch, load the new table asynchronously, bump a store version, and remount the components that read presets. [inference]

**3c. Pinning the locale in tests and checks: with this work.**
- `bun test` (no Vite): set `baseLocale: "en"` in `project.inlang/settings.json`, so the default when nothing is stored is English. [docs: strategy, baseLocale is the final fallback] Also add a preload file that calls `setLocale('en', { reload: false })`. [docs: home]
- Vitest: the same call in `setupFiles`.
- Browser checks (Playwright, `bun run check-*`): load with `?locale=en` (the app's URL sync, parking-lanes pattern [local]), and set `localStorage['PARAGLIDE_LOCALE'] = 'en'` before load with an init script. The key name is the documented default [docs: compiler-options]. With `strategy: ['localStorage','baseLocale']`, the stored value wins [inference from docs order rule].
- Parking-lanes pins nothing today [local]. Tests there run in the base locale, which is German [inference].

**3d. React Compiler and re-rendering: with this work.**
- The default does not need the question: `setLocale()` reloads, and the new document renders in the new language [docs: home; README].
- With `reload: false`, messages read module state through `getLocale()`, not React state. Components the React Compiler has memoised do not re-render when only the locale changes. Both local repos therefore remount a subtree on a `key` built from the locale [local: traffic-sign src/routes/__root.tsx; parking-lanes WidthAuditPage.tsx].
- Pattern for a client-only Vite React app [inference, from local practice and the docs]:
  1. Simplest and recommended for step 1: `setLocale(locale)` with the default reload.
  2. If a live switch is wanted: keep the locale in one Zustand store. Call Paraglide's `setLocale(locale, { reload: false })` in the action that changes the store, not during render. Render `<div key={locale}>` at the root so the subtree remounts. Parking-lanes calls `setLocale` during render, which is a side effect in render and is worth avoiding [local].

**3e. Where the compile step runs.**
- The docs recommend Pattern 1 (each package compiles a shared root project) [docs: monorepo]. For Maid, headless packages do not compile anything (3a), so compile happens only where text is rendered.
- Recommendation: one shared `project.inlang` in a new `packages/i18n` (Pattern 2). Consumers import `./messages` and `./runtime`. Maid has one strategy, so the docs' "same strategy" warning does not bite. [inference]
- Mapping the owner's wish ("predev or postinstall scripts transform the translations, then we rely on the registry in our JSON files"):
  - The messages JSON in the repo is the registry (source of truth, committed). [docs: compiling-messages]
  - The compiler output is generated and ignored. The compile is the transform. [local: both repos]
  - Practice in both local repos: the Vite plugin compiles on dev and build, and an explicit `build:paraglide` script runs before type-check and tests [local: parking-lanes root package.json, `ensure-paraglide`].
  - Maid's scripts: `i18n-compile` (run in `predev`, `check`, `test-run`, `type-check`). The preset JSON transform (`i18n-presets`) is separate and can run in `postinstall` and `predev`, as the earlier study says. [inference]
- Repo rules: every workflow gets a `bun run <script>` entry; commands non-interactive; no network. Compile reads local files only [inference]. Install-time network: new npm versions younger than five days are not installed (`minimumReleaseAge`). The docs give no publish dates, so check the publish date of the pinned Paraglide version before installing. [docs: changelog shows no dates]

**3f. Agents listing missing keys and checking four locales: 30-line script, with `inlang check` as a second line.**
- `npx @inlang/cli check --project ./project.inlang --format json --no-fail` gives JSON and is documented for CI [docs: checking-translations]. The installed CLI version must have `check` (the 3.2.0 README does not list it). Output shape not verified.
- Recommended: a 30-line script `i18n-missing` that reads `messages/{en,de,fr,es}.json` and writes JSON: for each locale, `missing: [{key, en, placeholders}]`, `extra`, and `placeholderMismatch`. It also checks `{name}` tokens and markup, works offline, and its output shape is under Maid's control. [inference]

---

## 4. Recommendation

- **Packages and files.** New `packages/i18n` (Paraglide Pattern 2): `project.inlang/settings.json` (baseLocale `en`; locales `en`, `de`, `fr`, `es`; message-format and m-function-matcher plugins), `messages/{en,de,fr,es}.json` (committed; flat snake_case keys; no plurals in step 1), `paraglide/` generated and git-ignored. Headless packages (`validation`, `operations`, `presets`, `core`) import no Paraglide code and return `{ id, values }` descriptors typed in an import-free file. Presets come from a git-ignored JSON registry (`apps/maid/src/i18n/presets/<locale>.json`) written by `i18n-presets`, and loaded with dynamic `import()`.
- **Scripts and strategy.** Root scripts: `i18n-compile` (in `predev`, `check`, `test-run`, `type-check`), `i18n-presets` (`postinstall`, `predev`), `i18n-missing` (JSON for agents), `i18n-check` (in `check`). Strategy: `['localStorage','preferredLanguage','baseLocale']` with `baseLocale: "en"`. The app's `?locale=` sync at startup wins over all of them. Pin the Paraglide version exactly.
- **What does not work or is awkward, and the handling.** No dynamic id lookup: an explicit typed id map in the app. All locales are in every message module: acceptable for about 500 UI strings, never for presets. Plurals are unresolved: avoid in step 1. Locale switch reloads by default: use reload, or a store plus key remount. Missing-translation fallback is undocumented: test on a scratch four-locale compile before relying on it. `machine translate` and Fink send text out: not used. Version churn (2.22, 2.25, 2.27 changed trailing slashes and plural selection): pin.
- **Two-step rollout.** Step 1: `packages/i18n`, UI strings, the preset registry, locale strategy, tests pinned to `en`. Introduce the descriptor type in step 1 with no behaviour change, so step 2 changes only the producers (validation, operations, undo labels) and the journal shape changes once.

### Open questions for the owner

1. **Paraglide for UI copy, or the earlier study's own JSON registry for everything?**
   - (a) Paraglide for about 500 UI strings, JSON registry for presets. **Recommended**: owner's wish, proven in two local repos, typed keys, `check` for CI.
   - (b) Own JSON registry for everything, as the earlier study designed. No compile step, no docs-specified behaviour to test.
   - (c) Paraglide for presets too. Not recommended (3b).
2. **Language switch: reload or live?**
   - (a) Reload (Paraglide default). **Recommended for step 1.**
   - (b) Live: `reload: false`, store, key remount, preset table reload. More code, more to test.
   - (c) Per-locale build (`experimentalPerLocaleBuild`). Experimental; still navigates.
3. **Plurals in step 1?**
   - (a) None: separate keys for `one` and `other`, chosen in code with `Intl.PluralRules`. **Recommended.**
   - (b) inlang declarations syntax after a test compile.
   - (c) ICU `{count, plural}` after a test compile.
4. **Key style.**
   - (a) Semantic snake_case, as both local repos do. **Recommended**: readable for agents and reviewers.
   - (b) Random meaningless keys, as the docs advise, to survive renames.
5. **Machine translation.**
   - (a) Never. Agents draft, a person reviews. **Recommended.**
   - (b) Manual script with the owner's own Google or DeepL key. Sends text to Google or DeepL.
   - (c) In CI (the docs advise against this outside build pipelines).
6. **Sherlock and Fink.**
   - (a) Skip both. **Recommended.** Fink is a hosted editor for translators (likely external).
   - (b) Sherlock optional for developers; Fink not.
7. **Paraglide version.**
   - (a) Pin 2.25.4, the version the traffic-sign tool uses. **Recommended**, unless 2.27.0 is at least five days old and needed. Its publish date is unchecked.
   - (b) Pin 2.27.0 (newest; includes the message-format behaviour changes).
8. **Default language for a new visitor: English or German?** (Same question as the earlier study.) Options: English (**recommended**: the source is English and it is the fallback) or German.
9. **Where the messages live.**
   - (a) `packages/i18n` (**recommended**): UI packages can import it.
   - (b) `apps/maid/messages`: simpler, but UI packages cannot import it.

---

Sources read: paraglidejs.com (home, basics, architecture, strategy, compiling-messages, compiler-options, message-keys, variants, file-formats, markup, vanilla-js-ts, monorepo, checking-translations, vite, errors, changelog); github.com/opral/paraglide-js (README); unpkg.com/@inlang/cli@3.2.0/README.md; search summaries for Sherlock and Fink and the inlang CLI. The inlang marketplace URL redirects to paraglidejs.com.
