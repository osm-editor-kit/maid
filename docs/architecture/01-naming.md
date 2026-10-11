# What to call the code units that build a fork

Status: proposal for discussion. Tobias wants to ask others before deciding.

## What we are naming

A unit of code that a **developer** adds to a build of Maid to give it something the default editor does not have: a map layer, an inspector section, a validation rule, a task provider. It is listed in the config object of an app. It is never installed by an end user in the UI and never loaded from a URL.

The name has to make that last sentence obvious, because every familiar word comes with expectations.

## The candidates

How well-known projects use each word (web research, 2026-10-11; rows marked * were not verified against the project's own docs):

| Word | Used by | What people expect from the word | Fits us |
| --- | --- | --- | --- |
| plugin | Vite and Rollup (build-time), Payload and Medusa (listed in config by developers), WordPress* and Obsidian* (installed by users) | Often a marketplace and installation by the user | Partly. Correct for half the precedents, misleading for the other half |
| extension | VS Code, browsers, Grafana | Installed by the user, loaded at run time | No |
| add-on | Storybook, Firefox*, Blender* | A user-facing extra | No |
| mod | Games (Minecraft Forge and Fabric)* | Made by third parties, installed by players, changes behaviour the authors did not plan for | No. It also suggests "unsupported" |
| patch | `patch-package`, `bun patch`, Linux* | A diff applied to someone else's code | No. And we already use `bun patch` in its real meaning, for MapLibre |
| module | Medusa (units listed in a `modules` array), Nuxt* | A composable building block chosen by the developer | Yes. Risk: collides with "ES module" and is vague |
| integration | Astro (`integrations` array in the config) | A build-time connection to another tool or service | Partly. Odd for a sidebar section or a validation rule |
| preset | Babel, ESLint, Tailwind | A shareable bundle of configuration | For a different thing: a fork's whole configuration. Collides with iD's tagging presets |
| feature | (general) | A capability of the product | No. In a map editor "feature" means a map object |
| pack | Language packs, icon packs | A bundle of related additions | Partly. Light user-install flavour |

Words for the mechanism, which we need as well and which are uncontroversial:

- **Extension point**: a place in the core where units attach (VS Code "contribution points", Backstage and Grafana "extension points").
- **Hook**: a named callback the core calls (WordPress actions and filters, Rollup and Fastify hooks, `hookable`).
- **Slot**: a place in the UI that units fill (WordPress Gutenberg SlotFill).

## Recommendation

**"Module"**, always written as "Maid module" in prose and `MaidModule` in code, with packages named `module-*`.

- It is the one common word with no marketplace or user-install meaning.
- It reads correctly in the config: `modules: [maproulette(), tildaNotes()]`.
- The collision with ES modules is real. The fixed prefix handles it in writing; in conversation it will sometimes need a second sentence.

Second choice: **"plugin"**, if we prefer the word everyone already knows and accept writing "build-time only, no plugin store" into the first paragraph of the docs. Payload uses it exactly our way.

Not recommended: "mod" and "patch". Both tell people something untrue about how the thing is made and supported, and "patch" already has its own job in this repo.

Until the name is decided, the other chapters say "module".

## The rule that comes with the name

Whatever the word: these units are added in code, by the people who build an editor. Maid has no mechanism to load one from a URL, from storage or through the UI, and will not get one. This is a security property as much as a naming one: a link can never make someone's editor run code.
