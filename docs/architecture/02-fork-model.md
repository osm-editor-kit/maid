# How a fork is made and kept up to date

Status: **agreed by Tobias on 2026-10-11**, including how forks consume Maid and that replacing components comes later.

## The question

Someone wants their own editor: Radnetz Berlin, a MapRoulette editor, a parking editor. How do they make it, and what happens when Maid moves on?

## The models that exist

From a review of how other projects do it (web research, 2026-10-11):

| Model | Example | Fits when | Hurts when |
| --- | --- | --- | --- |
| Hard fork, then rebase or merge | Rapid from iD; the Radnetz and MapRoulette iD forks today | The variant is meant to diverge | It is meant to follow. The merge cost grows with every upstream change. The Radnetz fork patches about 110 upstream files |
| The app as a library | Backstage, Payload, Medusa | Variants are thin and compose published packages | The core has no stable API yet |
| Hooks | WordPress actions and filters, Rollup, Fastify, webpack's Tapable | Many variants with different needs | Every hook name and argument becomes public API |
| Slots and extension points | WordPress Gutenberg SlotFill, VS Code contribution points, Grafana | Fixed places in the UI that others fill | The slot ids are public API too |
| Swizzle or eject a component | Docusaurus | One component needs to look different | Ejected code stops getting fixes |
| Copy the code | shadcn/ui | The copier wants to own it | It is maintenance by the fork from then on |
| Patch a dependency | `patch-package`, `bun patch` | A short bridge until upstream has the change | The patch lives long |

## The model

**A fork is a small app that depends on Maid's packages. It is not a copy of this repo.**

```
radnetz-berlin/
  package.json        depends on Maid's npm packages
  src/main.tsx        createEditor({ ...config, modules: [...] })
  src/modules/        the fork's own modules
```

- What a fork changes, it changes through the **config object**, through **modules** that register at extension points, and through **hooks**.
- Maid's own default editor (`apps/maid`) is built the same way. If the default editor cannot do something through the public API, neither can a fork, and we find out first.
- A fork never rebases. It updates a dependency version.

### Inside the monorepo and outside

- **Inside**, Maid's own apps and core modules depend on each other as workspace packages. No publishing step between a change and its use.
- **Outside**, a fork depends on the **published npm packages** of Maid. That needs a release routine (versions, a changelog, changesets as in the other osm-editor-kit repos), which is the price of forks that do not rebase.

### When a fork needs something Maid does not offer

This is the case Tobias asked about, and the answer is the combination he suggested:

1. The fork adds the missing hook or extension point to its local copy of the Maid package with **`bun patch`**. It can ship the same day.
2. It opens a pull request with that same change against Maid.
3. When the change is released, the patch is deleted. `bun patch` is tied to an exact version, so an update makes the leftover patch impossible to forget.

So `bun patch` is the bridge, the hook is the destination, and upstream first is the habit.

### Is it fine to have many hooks?

At run time, yes: an unused hook is an empty list that is looked at when its moment comes. (That it is negligible is an expectation, not a measurement.)

The cost is elsewhere. Every hook is a promise: its name, its arguments and the moment it is called. The research found no project that recommends "add every hook anyone asks for and never think about it again". The ones that scale put guard rails around it:

- **One typed hook map.** All hooks are declared in one TypeScript type. A module that uses a hook that changed fails to compile.
- **A hook needs a consumer.** It is added when a fork has a concrete use, with that use as its test, not on speculation.
- **Two stability levels.** A new hook is `experimental`: it may change in any release. After a second fork uses it, it becomes `stable` and from then on is deprecated before it is removed.
- **One test per hook** with a fake module, so a refactoring cannot silently stop calling it.

With those four, "be open to adding hooks one by one as forks ask" is sustainable, and it is the plan.

### What is a hook and what is an extension point

- An **extension point** takes a thing: a layer, a section, a rule, a field type. The 17 in the extensibility plan are extension points.
- A **hook** takes a function that is called at a moment and may change a value on its way: `changeset:beforeUpload`, `selection:changed`, `tags:beforeApply`. Modelled on WordPress's split into actions (something happened) and filters (change this value).

Both are registered in a module's `setup`.

## Decided

- Modules are build-time only, never from a URL or the UI ([naming](01-naming.md)).
- The name is "Maid module", with core modules in the monorepo and external modules in forks ([naming](01-naming.md)).
- Inside the monorepo: workspace packages. External forks: Maid's npm packages.
- A missing hook is patched locally with `bun patch` and upstreamed.
- The bottom dock is part of the default editor. A fork can switch it off; it is not a module.
- Replacing a core UI component (the Docusaurus "swizzle" idea) comes later, if at all. Slots and config first.

## Open

- The release routine: when packages are first published, how versions are cut, and what counts as a breaking change while everything is still moving.
- The first list of hooks, which should come from porting the two existing forks and not from guessing.
