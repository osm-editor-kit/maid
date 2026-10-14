# Deploying to GitHub Pages

The workflow `.github/workflows/pages.yml` builds one Maid app and publishes it to GitHub Pages, on every push to
`main` and by hand from the Actions tab. No secret is needed.

**`deploy.env`** (repository root) says what to deploy:

- `MAID_APP`: the app folder, for example `maid`, `maid-bicycle`, `maid-parking` or your own.
- `MAID_BASE`: the path the site is served from. Empty means `/<repository name>/`, for example `/maid/`. A fork with its
  own domain sets `/`.
- `MAID_SERVERS`: the OSM servers the app offers, as iD's `ID_API_CONNECTION`: `osm` (openstreetmap.org, production),
  `dev` (the development server, staging) or `osm,dev`. The first is the default; with one, the server choice does not
  show.

**Repository variables** (Settings, Secrets and variables, Actions, Variables) override `deploy.env` when they are set:

- `MAID_APP`, `MAID_BASE`, `MAID_SERVERS`: as above.
- `OSM_CLIENT_ID`, `OSM_DEV_CLIENT_ID`: the client ids of your OAuth apps on openstreetmap.org and on the development
  server. They are public. Without one, "Log in" on that server says what is missing.
- `MAPILLARY_TOKEN`: optional; without it the shared token in `apps/mapillary-token.ts` is used. A fork should set its own.

Maid is a public OAuth client with PKCE. It has no client secret; never put one in the repository or in a variable.

## Setup for a fork

1. Settings, Pages, Build and deployment: Source "GitHub Actions".
2. Set `deploy.env` and the repository variables.
3. Register an OAuth app on each server you offer: `https://www.openstreetmap.org/oauth2/applications` and
   `https://master.apis.dev.openstreetmap.org/oauth2/applications`. Redirect URI: your Pages address plus `land.html`
   (for example `https://osm-editor-kit.github.io/maid/land.html`; add `http://127.0.0.1:5173/land.html` to log in from
   local development). Not confidential. Scopes `read_prefs`, `write_api`, `write_notes`. Put the client ids in
   `OSM_CLIENT_ID` and `OSM_DEV_CLIENT_ID`.
4. Push to `main`, or run the workflow by hand.

## What the deployed editor does

- It reads the data of the first server in `MAID_SERVERS`. In the account menu, "Server" switches between
  OpenStreetMap and the development server when both are offered; unsaved edits must be saved or undone first.
- "Log in" goes to the server of the data, and edits are saved there. Each server has its own login.
- The static demo data (the fixtures) exist only locally: they come from the mock API of `bun run dev`. Locally,
  `?live=0` shows them, `?live=1` OpenStreetMap, `?live=dev` the development server.

To build the Pages version locally, in the app folder: `VITE_BASE=/maid/ VITE_MAID_DATA=live bun run build`.
