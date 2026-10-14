# Deploying to GitHub Pages

The workflow `.github/workflows/pages.yml` builds one Maid app and publishes it to GitHub Pages, on every push to
`main` and by hand from the Actions tab. No secret is needed.

**`deploy.env`** (repository root) says what to deploy:

- `MAID_APP`: the app folder, for example `maid`, `maid-bicycle`, `maid-parking` or your own.
- `MAID_BASE`: the path the site is served from. Empty means `/<repository name>/`, for example `/maid/`. A fork with its
  own domain sets `/`.

**Repository variables** (Settings, Secrets and variables, Actions, Variables) override `deploy.env` when they are set:

- `MAID_APP`, `MAID_BASE`: as above.
- `OSM_DEV_CLIENT_ID`: the client id of your OAuth app on the OSM development server. Without it, "Log in" says what is
  missing.
- `MAPILLARY_TOKEN`: optional; without it the shared token in `apps/mapillary-token.ts` is used. A fork should set its own.

Maid is a public OAuth client with PKCE. It has no client secret; never put one in the repository or in a variable.

## Setup for a fork

1. Settings, Pages, Build and deployment: Source "GitHub Actions".
2. Set `deploy.env` and the repository variables.
3. Register an OAuth app at `https://master.apis.dev.openstreetmap.org/oauth2/applications` with your Pages address plus
   `land.html` as redirect URI (for example `https://osm-editor-kit.github.io/maid/land.html`) and the scopes
   `read_prefs`, `write_api`, `write_notes`. Put its client id in `OSM_DEV_CLIENT_ID`.
4. Push to `main`, or run the workflow by hand.

## What the deployed editor does

- It reads the real OpenStreetMap data from `api.openstreetmap.org`, read only, and never saves there.
- In the account menu, "Server: Development server" allows logging in and saving, only to
  `master.apis.dev.openstreetmap.org`.

To build the Pages version locally, in the app folder: `VITE_BASE=/maid/ VITE_MAID_DATA=live bun run build`.
