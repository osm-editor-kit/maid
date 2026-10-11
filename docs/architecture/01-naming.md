# What to call the code units that build a fork

Status: **decided by Tobias on 2026-10-11: "Maid module".** The comparison below is kept as the reasoning.

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

## Decision

**"Module"**, always written as "Maid module" in prose and `MaidModule` in code, with packages named `module-*`.

- It is the one common word with no marketplace or user-install meaning.
- It reads correctly in the config: `modules: [maproulette(), tildaNotes()]`.
- The collision with ES modules is real. The fixed prefix handles it in writing; in conversation it will sometimes need a second sentence.

Considered and not chosen: "plugin" (people expect a store), "mod" (suggests third-party and unsupported) and "patch" (means a diff, and already has its own job in this repo).

## Core modules and external modules

There is one kind of module and one way to write it. Where it lives gives it one of two names:

| | Core module | External module |
| --- | --- | --- |
| Lives in | The Maid monorepo, `packages/module-*` | A fork's own repository |
| Maintained by | Maid | The fork |
| Reaches an editor | Part of Maid's default set, or exported for forks to add | Listed by the fork in its config |
| Tested and released | With Maid | By the fork |
| Examples | Imagery, street-level photos, notes, data layers, MapRoulette | TILDA notes, a Radnetz QA lens |

Rules that keep the two the same thing:

- **Core modules use only the public API**: the same extension points and hooks an external module gets. If a core module needs something private, that thing becomes public or the code is not a module but part of the core.
- **An external module can become a core module** by moving its folder, without a rewrite. That is the path for a fork's feature that others want too.
- **"Core" alone means something else**: the editor itself (`editor-core`, the data layer, the renderer), which is not made of modules. So: the core, core modules, external modules.
- A fork's default set is its choice: it can leave out any core module.

## The rule that comes with the name

Whatever the word: these units are added in code, by the people who build an editor. Maid has no mechanism to load one from a URL, from storage or through the UI, and will not get one. This is a security property as much as a naming one: a link can never make someone's editor run code.
