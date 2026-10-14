# Maid

**Ma**pLibre **iD** Editor: an iD-inspired OpenStreetMap editor to build your own single-purpose editor on.

**Try it:** https://osm-editor-kit.github.io/maid/ (reads the real map; saving only to the OSM development server)

OpenStreetMap data gets more detailed by the minute, and communities form around their topics: road and bike
infrastructure, street parking, playgrounds, climbing routes. Each deserves an editor made for its topic and limited
to it.

## One central Maid, many editors

This repository is the central Maid. An editor is an app in `apps/` with a config that picks modules, presets and
filters; everything a topic needs beyond that is a module in `packages/`. We build our own editors the same way:
`apps/maid` (general), `apps/maid-bicycle` (road and bike infrastructure) and `apps/maid-parking` (street parking).

To make your own editor:

1. **Fork** this repository.
2. **Add your app and modules** next to ours, for example `apps/maid-golf` and `packages/module-golf`. Coding agents
   work well here: [AGENTS.md](AGENTS.md) gives them the rules, the scripts and the checks.
3. **Deploy:** set `MAID_APP=maid-golf` in `deploy.env` (or as a repository variable) and push; the GitHub Action
   publishes that app to GitHub Pages. See [docs/deploying.md](docs/deploying.md).
4. **Stay in sync:** merge this repository into your fork now and then. Your work lives in your own app and module
   folders, so the merge has nothing to argue about. Where the core lacks something, change it in a small commit of its
   own and send it as a pull request, so your fork and the central Maid stay the same there.

## What it is made of

Kept from [iD](https://github.com/openstreetmap/iD): the tagging schema and presets, the imagery index, the look of the
data and the editing behaviour mappers know. Rewritten: rendering (MapLibre GL through `react-map-gl`), the interface
(React, TypeScript, Tailwind) and the tooling (Bun, Vite). The data model follows [Rapid](https://github.com/bhousel/Rapid).
Maid is faster than both: the map is ready, drawn and fully loaded sooner in every benchmark scene
([numbers](docs/research/performance-2026-10-13.md)).

## Develop

```bash
bun install
bun run dev        # the three apps and the local mock API
bun run check      # types, lint, format, texts, unit tests
bun run check-all  # the browser checks
```

Everything runs offline against frozen fixtures; automated runs send no request to OSM servers.
`bun run refs-setup` and `bun run compare` show iD, Rapid and Maid side by side, and `bun run bench` measures them.

More: [AGENTS.md](AGENTS.md) (how to work here), [docs/build-out/steps.md](docs/build-out/steps.md) (what is done and
next), [docs/architecture/](docs/architecture/README.md), [docs/adr/](docs/adr/), [docs/research/](docs/research/).
