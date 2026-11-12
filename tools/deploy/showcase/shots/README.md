# Screenshots of the overview page

One per app, `<app>.webp`, 960 × 600, shown on its tile. Made from the frozen fixtures with the dev server (`bun run dev`):
open the app at the position of its `overview.json` `open` with `scene=<fixture>`, 1280 × 800, wait for
`window.__bench.settled()` and a few seconds, then scale to 960 × 600 and save as WebP (quality about 72). Under
automation the background imagery is off (core rule 1), so the map is on black.

| App | Query |
| --- | --- |
| maid | `scene=medium&map=18/52.5219/13.4100&lens=surface` |
| maid-bicycle | `scene=dense&map=19/52.47912/13.43741&id=w585753318` |
| maid-parking | `scene=dense&map=18.5/52.49129/13.42547&id=w4495005` |
| maid-indoor | `scene=indoor&map=18.5/52.5251/13.3694&level=0` |
| maid-lanes | `scene=dense&map=19/52.47912/13.43741&id=w585753318` |

An app without a screenshot gets a tile without one.
