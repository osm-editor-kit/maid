# Maid

**Ma**pLibre **iD** Editor: the iD-inspired OpenStreetMap editor for building your own single-purpose editing experience.

OpenStreetMap data gets more detailed by the minute, and sub-communities gather around their fields of expertise. Each of them deserves an editor made for its topic: an editing experience that is limited to that topic and optimised for it. Road and bike infrastructure is the first; playgrounds, golf courses, climbing crags and routes, or footway mapping could be next.

## Your own editor

1. Fork this repository.
2. Add your app next to ours, for example `apps/maid-golf`: a config that says which modules, presets and filters your editor has, and nothing else.
3. Add what your topic needs as modules in `packages/` (a map layer, an inspector section, a validation rule, an operation). Features are built as modules, so your editor and ours do not get in each other's way.
4. Where the core lacks something, change it in your fork right away, as a small commit of its own, and open a pull request with that commit. When it is merged, your fork and this repository are the same there again.
5. Deploy: a GitHub variable names the app directory that is built and published to GitHub Pages.

To take over what happened here since, merge this repository into your fork. As long as your work lives in your own app and module directories, that merge has nothing to argue about.

This repository is built the same way: `apps/maid` is the default editor and `apps/maid-bicycle` the editor for road and bike infrastructure. If our own second editor cannot do something through a config and modules, neither can yours, and we find out first.

## What it is made of

Maid builds on the [iD](https://github.com/openstreetmap/iD) ecosystem and rewrites parts of the technology underneath. Kept from iD: the tagging schema and presets, the imagery index, the look of the data and the editing model people know. Rewritten: rendering (MapLibre GL through `react-map-gl`), the interface (React, TypeScript, Tailwind) and the tooling (Bun, Vite). The data model follows [Rapid](https://github.com/bhousel/Rapid).

It is a monorepo of separate packages, so that an editor replaces or extends single parts instead of patching one big code base.

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

## Deploying to GitHub Pages

The workflow `.github/workflows/pages.yml` builds one Maid app and deploys it to GitHub Pages. It runs on every push to `main`, and by hand from the Actions tab. No secret is needed.

**`deploy.env`** (in the repository root) says what to deploy:

- `MAID_APP` is the app folder: `maid`, `maid-bicycle` or `maid-parking`.
- `MAID_BASE` is the path the site is served from. Empty means `/<repository name>/`, for example `/maid/`. A fork with its own domain sets `/`.

**Repository variables** (Settings, Secrets and variables, Actions, Variables) override `deploy.env` when they are not empty:

- `MAID_APP` and `MAID_BASE`: the same as above.
- `OSM_DEV_CLIENT_ID`: the client id of the OAuth app on the development server (see below). Without it, Log in explains what is missing.
- `MAPILLARY_TOKEN`: optional. Without it the apps' shared token is used. A fork should set its own.

Maid is a public client. It uses PKCE and has no client secret. Never put a client secret in the repository or in a variable.

**Setup for a fork:**

1. Set Pages to deploy from GitHub Actions: Settings, Pages, Build and deployment, Source.
2. Set `deploy.env` and the repository variables.
3. Register an OAuth app on the development server, at `https://master.apis.dev.openstreetmap.org/oauth2/applications`. Its redirect URI is your Pages address with `land.html` at the end, for example `https://osm-editor-kit.github.io/maid/land.html`. Ask for the scopes `read_prefs`, `write_api` and `write_notes`.
4. Put the client id of that app in `OSM_DEV_CLIENT_ID`.
5. Push to `main`, or run the workflow by hand.

**What the deployed editor does:**

- It reads the real OpenStreetMap data from `api.openstreetmap.org`, read only. It never saves there.
- The account menu has a Server choice. Pick "Development server" to log in and save. Saving goes only to `master.apis.dev.openstreetmap.org`.

To build the Pages version locally, run this in the app folder: `VITE_BASE=/maid/ VITE_MAID_DATA=live bun run build`.
