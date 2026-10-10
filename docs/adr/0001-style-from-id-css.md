# 0001: The look is generated from iD's stylesheets and presets

Date: 2026-10-10

## Decision

`packages/style` does not contain a hand-written style. A script (`bun run --cwd packages/style generate`) reads the CSS of the pinned iD checkout and the presets of `@openstreetmap/id-tagging-schema` and writes three data files:

- `id-rules.json`: every CSS rule that styles a way path by tag classes (713 rules), with its specificity
- `area-keys.json`: which keys make a closed way an area (iD's `areaKeys`)
- `icon-presets.json`: preset tags and icons for points

At runtime `tagClasses(tags)` is a port of iD's `svgTagClasses`, and `resolveWayStyle(classes, geometry)` applies the rules like the CSS cascade does. The result (colours, widths for both zoom bands, dashes) is written into feature properties, and the MapLibre layers read it with `['get', ...]`.

## Why

- The plan asked for a "core subset" of iD's look. Generating from the source gave the complete line and area styling for the same effort, and it stays correct when iD changes.
- Classification in JavaScript, once per feature, keeps MapLibre's expressions trivial. A fork changes the look by changing the rules or the resolver, not 30 layer expressions.
- Results are cached per combination of classes. Most features share a few hundred combinations.

## What it does not cover

- State (hover, selected) and modes (wireframe, highlight edits). The renderer handles those.
- Fill patterns, sided markers (cliffs, coastlines), turn restrictions, and the selectors that depend on the mode.
- Point and vertex styling. That part of iD's CSS is small and is written by hand in `layers.ts`.
- Preset matching is simplified: all preset tags must match and exact values beat wildcards. iD also weighs geometry and `matchScore` in more detail.
