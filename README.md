# Maid

**Ma**plibre **iD** Editor: a rework of the [iD editor](https://github.com/openstreetmap/iD) for OpenStreetMap on a new stack, built on MapLibre and meant to be helpful.

Maid keeps iD's ecosystem (tagging schema, presets, imagery index, the editing model people know) and replaces the stack underneath: MapLibre GL through `react-map-gl`, React, TypeScript, Bun. It is organised as a monorepo of separate packages so that forks can replace or extend single parts instead of patching one big code base. Reusable parts are published in the [`@osm-editor-kit`](https://www.npmjs.com/org/osm-editor-kit) npm organisation.

## Status

Iteration 1 is a proof of concept that answers one question: can MapLibre render editable OSM data so that it looks and performs comparably to iD (SVG) and Rapid (PixiJS)?

**Result (2026-10-10): yes, with limits.** Read [docs/iteration-1/report.md](docs/iteration-1/report.md) for screenshots, timings and the caveats.

- [PLAN.md](PLAN.md): vision, core rules, and the plan for iteration 1
- [docs/iteration-1/report.md](docs/iteration-1/report.md): the answer
- [docs/iteration-1/steps.md](docs/iteration-1/steps.md): working steps and what is still open
- [docs/adr/](docs/adr/): decisions and what was measured for each
- [docs/research/](docs/research/): what we know about iD, Rapid, MapLibre and osm-editor-kit
- [AGENTS.md](AGENTS.md): how to work in this repo (for people and coding agents)

## Try it

```bash
bun install
bun run refs-setup   # clones and builds iD and Rapid at their pins, once
bun run compare      # the three editors side by side, http://localhost:5174
bun run bench        # the benchmark; then: bun run bench-report
```

Everything runs offline against frozen fixtures. No request goes to OSM servers.
