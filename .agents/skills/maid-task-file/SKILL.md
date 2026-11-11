---
name: maid-task-file
description: How to write a task file that Maid opens as a private task list (GeoJSON with maid_tasks, Markdown texts, options that change tags, add or delete features), and how a plain GeoJSON goes in as a data layer instead. Use when another project (tilda-geo, an analysis script, a language model) should hand Tobias a list of OSM features to check or fix in Maid, or when changing packages/tasks or module-tasks.
---

# A task file for Maid

Maid has **private task lists** (`packages/module-tasks`, ADR 0013): a person loads a file, works through its tasks
in the dock tab "Tasks", sees each task with its Markdown text in the inspector, and picks an option; Maid shows the
change before it is applied, as one undo step. The progress (open, done, ignored, skipped) is kept in the browser and
in the person's OSM user preferences. Teams use MapRoulette; this is for one person.

**The authority is [`packages/tasks/FORMAT.md`](../../../packages/tasks/FORMAT.md).** It is written to be pasted into
a prompt, has a full example and a checklist. This skill says when to use it and how to hand a file over.

## The file in one paragraph

A GeoJSON `FeatureCollection` with a top-level `maid_tasks` (`version: 1`, `list_id`, `title`, `description`) and at
most 20 000 features. Each feature is a task: a `geometry` (Point, LineString, Polygon, MultiLineString,
MultiPolygon; `[lon, lat]`) and `properties` with `task_id`, `title`, `description` (Markdown), optional `osm`
(`["way/123", "node/5"]`), `links` (https only), `mapillary` ids and up to 10 `options`. An option has an `id`, a
`label`, an optional Markdown `description`, and an `action`:

| `action` | Fields | What Maid does |
| --- | --- | --- |
| `tag` (default) | `set` and/or `remove`, optional `osm` (a subset of the task's) | changes the tags of the features in `osm` (one undo step), else of the selected task feature, with a tag diff. Give `osm` whenever a task has several features: Maid then shows each option's features beside its label, so the texts need not name them ("Für den ausgewählten Gehweg way/…" is redundant) |
| `create` | `set` (the new tags), optional `geometry` | adds a node, a way or a closed way at the option's or the task's geometry |
| `delete` | optional `osm` (a subset of the task's) | deletes the task's nodes and ways as iD's Delete does |

Moving features and changing geometry are not offered.

## Markdown

Every `description` is Markdown at the level of MapRoulette's task instructions (Tobias's iD MapRoulette fork):
headings, lists, quotes, code blocks, tables, bold, italic, code, https links, `{{key}}` from the task's properties,
`way/123` and openstreetmap.org links that select the element, `[copyable "text"]`. No raw HTML (shown as text), no
images (shown as links). Details in FORMAT.md, renderer in `packages/module-tasks/src/markdown.tsx`.

## From MapRoulette's Tag Fix form

A MapRoulette `.geojsonl` (one FeatureCollection per line, with `cooperativeWork`) is **not** read by Maid. Write the
task file instead, one task per line of it:

- `features[0].geometry` → the task's `geometry`; the feature's `id` (`way/123`) → `osm: ["way/123"]`;
- `properties.task_markdown` (or the challenge instruction) → `description`;
- each `modifyElement` with `setTags` → an option with `set`, `unsetTags` → `remove` (one option can hold both);
  add a second option such as "Leave it" with the current value only when it helps the person decide.

Keep the `.geojsonl` as well when the same list should also run in MapRoulette, and say so in the report.

## Check, hand over, open

1. Check: `bun run tasks-check <file.geojson>` from the Maid repository root. It prints errors with paths, writes
   `reports/tasks-check.json` and exits 1 on any error. Fix until it exits 0.
2. Hand over: write the file where Tobias finds it (not into the Maid repository unless asked), and say in the report
   how many tasks it has, which query made them and what the options do.
3. Open: in Maid, account menu → "Load task list…", or `?tasks=<https address>` in a Maid link (the address must allow
   requests from Maid's origin). Nothing is loaded under automation except the mock's fixtures (AGENTS.md, rule 1).

Do not upload anything and do not call OSM services from Maid's side.

## Only to look at: a data layer

A plain GeoJSON (no `maid_tasks`) or a GPX opens as a **data layer** (`packages/module-data-layers`): the Data
layers flyout, kind "GeoJSON", a colour, a file or `?data=<address>`. Maid only draws it in one colour, in memory; it
reads no property, has no list and no done state. Use it to show where something is, not to work through it. The
parser is `packages/module-data-layers/src/geojson.ts`: a `FeatureCollection` or a `Feature`, features with
`geometry: null` dropped, coordinates not checked, KML refused.

## Where this lives

Format, parser and checker `packages/tasks` (`FORMAT.md`, `src/schema.ts`); the module `packages/module-tasks`;
the progress in the preferences `packages/osm-prefs`; decisions ADR 0013. If you change what is accepted, update
FORMAT.md and this file.
