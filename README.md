# Maid

**Ma**pLibre **iD** Editor: an OpenStreetMap editor built as a base for single-purpose editors. Projects add their own configuration and modules instead of maintaining a fork.

Maid builds on the [iD](https://github.com/openstreetmap/iD) ecosystem and rewrites parts of the technology underneath. Kept from iD: the tagging schema and presets, the imagery index, the look of the data and the editing model people know. Rewritten: rendering (MapLibre GL through `react-map-gl`), the interface (React, TypeScript, Tailwind) and the tooling (Bun, Vite). The data model follows [Rapid](https://github.com/bhousel/Rapid).

It is organised as a monorepo of separate packages, so that a project can replace or extend single parts instead of patching one big code base. Reusable parts are published in the [`@osm-editor-kit`](https://www.npmjs.com/org/osm-editor-kit) npm organisation.

## Status

Iteration 1 is a proof of concept that answers one question: can MapLibre render editable OSM data so that it looks and performs comparably to iD (SVG) and Rapid (PixiJS)?

**Result (2026-10-10): yes, with limits.** Read [docs/iteration-1/report.md](docs/iteration-1/report.md) for screenshots, timings and the caveats.

- [PLAN.md](PLAN.md): vision, core rules, and the plan for iteration 1
- [docs/iteration-1/report.md](docs/iteration-1/report.md): the answer
- [docs/iteration-1/steps.md](docs/iteration-1/steps.md): working steps and what is still open
- [docs/extensibility-plan.md](docs/extensibility-plan.md): how forks become configuration: packages, the config object, extension points
- [docs/architecture/](docs/architecture/README.md): work docs per topic (naming, fork model, data store, filters, URL state, storage and settings, UI, Rust), with decisions and open questions
- [docs/adr/](docs/adr/): decisions and what was measured for each
- [docs/research/](docs/research/): what we know about iD, Rapid, MapLibre and osm-editor-kit
- [AGENTS.md](AGENTS.md): how to work in this repo (for people and coding agents)

## Try it

```bash
bun install
bun run refs-setup   # clones and builds iD and Rapid at their pins, once
bun run compare      # the three editors side by side, http://localhost:5184
bun run bench        # the benchmark; then: bun run bench-report
```

Everything runs offline against frozen fixtures. No request goes to OSM servers.
