# 0004: Points are dots, with pins where they fit

Date: 2026-10-10

## Decision

Every point is always drawn as a small dot (a circle layer). On top, iD's pin with the preset icon is drawn where there is room; MapLibre's symbol collision decides. Named features get a pin first. Pin and icon are one image, so they appear and disappear together. Address nodes are small markers, with the house number from OSM zoom 19 on. `?pins=all` draws every pin.

## Why

- Real inner-city data has thousands of points in one view (dense scene at zoom 17: about 8000). Drawing every pin covers the map.
- iD's answer is to hide all points once more than 200 are in view (100 for address points, 250 for buildings). The mapper then sees a "hidden features" notice and no points at all. With dots plus fitting pins nothing is invisible and the map stays readable.
- All pins as overlapping symbols were also the most expensive part of the style: about 650 ms of main-thread work per second while panning the dense scene, against about 85 ms for everything else.

## Costs

- MapLibre places symbols over several frames. Maid reports a picture as final only when placement and the label fade are done, which adds to its load and settle times. `fadeDuration` trades this against main-thread work: at 0 MapLibre places symbols on every frame (pan: 990 ms of work per second on the dense scene), at 300 ms it was 260 ms.
- Markers have to exist before their features reach MapLibre. Images that were added later did not show up in tiles that had already been laid out, so the engine has a `prepare` hook that the app uses to create them first.
