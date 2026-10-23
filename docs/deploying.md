# Deploying to GitHub Pages

The workflow `.github/workflows/pages.yml` builds Maid apps with `bun run pages-build` (`tools/deploy/build-pages.ts`)
and publishes them to GitHub Pages, on every push to `main` and by hand from the Actions tab. No secret is needed.

**`deploy.env`** (repository root) says what to deploy:

- `MAID_APP`: the app folder, for example `maid`, `maid-bicycle`, `maid-parking` or your own, or a comma list of them.
  - One app is served at the path itself, for example `https://osm-editor-kit.github.io/maid/`.
  - Several apps are each served from a folder of their own (`/maid/maid/`, `/maid/maid-bicycle/`, …), so each can be
    tested and used on its own. The path shows a page with a link to each. All of them log in through the `land.html`
    at the path, so the OAuth apps need one redirect URI for all.
  - This repository deploys all three apps. A fork that names one app keeps the editor at its path.
- `MAID_BASE`: the path the site is served from. Empty means `/<repository name>/`, for example `/maid/`. A fork with its
  own domain sets `/`.

**Repository variables** (Settings, Secrets and variables, Actions, Variables) override `deploy.env` when they are set:

- `MAID_APP`, `MAID_BASE`: as above.
- `OSM_CLIENT_ID`, `OSM_DEV_CLIENT_ID`: the client ids of your OAuth apps on openstreetmap.org and on the development
  server. They are public. Without one, "Log in" on that server says what is missing.
- `MAPILLARY_TOKEN`: optional; without it the shared token in `apps/mapillary-token.ts` is used. A fork should set its own.

Maid is a public OAuth client with PKCE. It has no client secret; never put one in the repository or in a variable.

## Setup for a fork

1. Settings, Pages, Build and deployment: Source "GitHub Actions".
2. Set `deploy.env` and the repository variables.
3. Register an OAuth app on each server you offer: `https://www.openstreetmap.org/oauth2/applications` and
   `https://master.apis.dev.openstreetmap.org/oauth2/applications`. Redirect URI: your Pages address plus `land.html`
   (for example `https://osm-editor-kit.github.io/maid/land.html`; add `http://127.0.0.1:5173/land.html`,
   `http://127.0.0.1:5176/land.html` and `http://127.0.0.1:5177/land.html` to log in from local development, one per
   app, as the login popup hands its result only to a tab of the same origin). Not confidential. Scopes `read_prefs`,
   `write_api`, `write_notes`. Put the client ids in `OSM_CLIENT_ID` and `OSM_DEV_CLIENT_ID`.
4. Push to `main`, or run the workflow by hand.

## This repository's OAuth apps

Registered by Tobias, account `tordans`. The redirect URIs, client ids and scopes are changed there:

- openstreetmap.org: https://www.openstreetmap.org/oauth2/applications/13159
- Development server: https://master.apis.dev.openstreetmap.org/oauth2/applications/1555/edit

Redirect URIs (2026-10-23): `http://127.0.0.1:5173/land.html`, `http://127.0.0.1:5176/land.html`,
`http://127.0.0.1:5177/land.html` and `https://osm-editor-kit.github.io/maid/land.html`. A new app with a port of its
own needs its own line. Locally the client ids go into `apps/<app>/.env.local` (see `.env.example`).

## What the deployed editor does

- It reads the data of the first server in `osm.servers` of the app's `maid.config.ts` (default: OpenStreetMap, then
  the development server; `['dev']` for staging only, as iD's `ID_API_CONNECTION`). In the account menu, "Server"
  switches between them when there are two; unsaved edits must be saved or undone first.
- "Log in" goes to the server of the data, and edits are saved there. Each server has its own login.
- The static demo data (the fixtures) exist only locally: they come from the mock API of `bun run dev`. Locally,
  `?api=mock` shows them, `?api=osm` OpenStreetMap, `?api=dev` the development server; locally the account menu's
  "Server" offers the three too.

To build the Pages site locally: `bun run pages-build` (into `site/`, git-ignored). The settings stored in the browser
(background, theme and others) are shared between apps on the same address; the unsaved edits are kept per app.
