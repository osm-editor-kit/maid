# Maid task file: format

You are writing (or checking) a task file for the Maid map editor. A task file is a list of map tasks. Each task
points at a place on the map, shows a short title and a Markdown description, and offers one or more options. The
mapper picks an option, and Maid shows the change before anything is saved. An option can change the tags of the
task's features, add a new feature, or delete features. Moving features or changing their geometry is not possible. Maid does not fetch the tasks from
anywhere: the file is made by a person or by a language model, then loaded into Maid.

The file is a GeoJSON `FeatureCollection` with one extra top-level member, `maid_tasks`, that describes the list.
Each task is a GeoJSON `Feature`.

Write valid JSON only: no comments, no trailing commas. Coordinates are `[longitude, latitude]` in degrees, longitude
first.

## The file

| Member                 | Type                 | Rule                                                                 |
| ---------------------- | -------------------- | -------------------------------------------------------------------- |
| `type`                 | string               | `"FeatureCollection"`                                                |
| `maid_tasks`           | object               | the list info, see below. Required.                                  |
| `features`             | array                | the tasks, at most 20 000. May be empty.                             |

Other top-level members are allowed and kept.

### `maid_tasks` (the list)

| Field         | Type   | Rule                                                                              |
| ------------- | ------ | --------------------------------------------------------------------------------- |
| `version`     | number | must be `1` (the number one, not the string)                                      |
| `list_id`     | string | 1 to 64 characters: letters, digits, `.` `_` `:` `-`. Example: `berlin-cycleways-2026-10` |
| `title`       | string | 1 to 200 characters                                                               |
| `description` | string | Markdown, at most 10 000 characters. May be empty, but give it.                   |

### `features[]` (a task)

| Field                 | Type            | Rule                                                                              |
| --------------------- | --------------- | --------------------------------------------------------------------------------- |
| `type`                | string          | `"Feature"`                                                                       |
| `geometry`            | object          | required. One of the five types below.                                            |
| `properties`          | object          | required, see below. Other properties are allowed and kept.                       |

Geometry types: `Point`, `LineString`, `Polygon`, `MultiLineString`, `MultiPolygon`. Positions are `[lon, lat]`, with
lon between -180 and 180 and lat between -90 and 90. A `LineString` has at least 2 positions. A `Polygon` ring has at
least 4 positions and its last position equals its first.

### `properties` (the task)

| Field         | Type               | Rule                                                                                  |
| ------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `task_id`     | string             | required. 1 to 64 characters: letters, digits, `.` `_` `:` `-`. Unique in the file.   |
| `title`       | string             | required. 1 to 200 characters. The line shown in the list.                            |
| `description` | string             | required. Markdown, at most 10 000 characters. May be empty.                          |
| `osm`         | array of strings   | optional, at most 50. Each `node/<id>`, `way/<id>` or `relation/<id>` (id without a leading zero). Unique. |
| `links`       | array of strings   | optional, at most 20. Each an `https://` URL.                                         |
| `mapillary`   | array of strings   | optional, at most 20. Each a Mapillary image id: digits only, at most 20 digits.      |
| `options`     | array of objects   | optional, at most 10. See below.                                                      |

### `options[]` (an answer the mapper can pick)

| Field         | Type               | Rule                                                                                             |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `id`          | string             | required. 1 to 64 characters: letters, digits, `.` `_` `:` `-`. Unique within its task.          |
| `label`       | string             | required. 1 to 200 characters. The button text.                                                  |
| `description` | string             | optional. Markdown, at most 10 000 characters.                                                   |
| `action`      | string             | optional. `"tag"` (the default), `"create"` or `"delete"`. See below.                            |
| `set`         | object             | Tag key to tag value. Each key and each value 1 to 255 characters. `tag`: adds or changes tags; `create`: the tags of the new feature. |
| `remove`      | array of strings   | `tag` only. Tag keys to delete. Each 1 to 255 characters.                                        |
| `geometry`    | object             | `create` only, optional. Where the new feature goes: a `Point`, a `LineString` or a `Polygon` with one ring. |
| `osm`         | array of strings   | `delete` only, optional. Which of the task's `osm` features to delete: `node/<id>` or `way/<id>`. |

#### `"action": "tag"` (the default): change the tags of a feature

The mapper selects the task's feature on the map, and the option changes its tags. At least one of `set` and
`remove` is non-empty. A key may not be in both `set` and `remove`. To delete a tag, use `remove`; an empty value is
not allowed in `set`. No `geometry`, no `osm`.

#### `"action": "create"`: add a new feature

`set` holds the tags of the new feature and must not be empty; there is no `remove` and no `osm`. The feature goes at
the option's `geometry`, or, without one, at the task's geometry:

- a `Point` becomes a node with the tags;
- a `LineString` becomes a way with the tags, through new untagged nodes;
- a `Polygon` with one ring (no holes) becomes a closed way. Its tags decide whether it is an area: add `"area": "yes"`
  when the tags alone do not make one (`building`, `leisure`, `landuse` and the like do).

The new nodes are not joined to existing ones; the mapper connects them afterwards. Without an option `geometry`, the
task's geometry must be one of the three types above. A task for a missing feature usually has no `osm` at all.

#### `"action": "delete"`: delete features

No `set`, `remove` or `geometry`. The option deletes the features in its `osm`, or, without one, all the task's `osm`
features. Each must be in the task's `osm`, and only nodes and ways can be deleted (a relation cannot): a task with a
relation in its `osm` needs an `osm` on its delete option. Maid refuses, as iD does, to delete a way of a route,
boundary or the outer ring of a multipolygon, and a feature with a `wikidata` tag. A way takes its untagged nodes
along that no other way uses.

## Full example

A valid file with one task. Copy it and change it:

```json
{
  "type": "FeatureCollection",
  "maid_tasks": {
    "version": 1,
    "list_id": "berlin-cycleways-2026-10",
    "title": "Check cycleways",
    "description": "Check each street in Lichtenrade. Pick the option that matches the street as it is now, or skip the task."
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [13.4010, 52.3880],
          [13.4021, 52.3884]
        ]
      },
      "properties": {
        "task_id": "t-0001",
        "title": "Bahnhofstraße: is there a cycle lane?",
        "description": "A **tertiary** road. Look at the street in the imagery.\n\n- A cycle lane is a painted lane next to the traffic.\n- If you cannot tell, skip the task.",
        "osm": ["way/4378528"],
        "links": ["https://wiki.openstreetmap.org/wiki/Key:cycleway"],
        "mapillary": ["123456789012345"],
        "options": [
          {
            "id": "cycleway-lane",
            "label": "It has a cycle lane",
            "description": "A painted lane along the road.",
            "set": { "cycleway": "lane" }
          },
          {
            "id": "no-cycleway",
            "label": "No cycle lane",
            "set": { "cycleway": "no" },
            "remove": ["cycleway:both"]
          },
          {
            "id": "no-maxspeed",
            "label": "Remove the speed limit tag",
            "remove": ["maxspeed"]
          }
        ]
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [13.4032, 52.3891] },
      "properties": {
        "task_id": "t-0002",
        "title": "A bench at the bus stop?",
        "description": "Street-level images show a bench here. Is it there, and is the old one next to it gone?",
        "osm": ["node/987654"],
        "options": [
          {
            "id": "add-bench",
            "label": "Add the bench",
            "action": "create",
            "set": { "amenity": "bench", "backrest": "yes" }
          },
          {
            "id": "old-bench-gone",
            "label": "The old bench is gone",
            "action": "delete"
          }
        ]
      }
    }
  ]
}
```

## Checklist

Before you hand the file over, check each line:

- [ ] The root is a `FeatureCollection` with `maid_tasks` and `features`.
- [ ] `maid_tasks.version` is the number `1`.
- [ ] `list_id` and every `task_id` and option `id` match `^[A-Za-z0-9._:-]{1,64}$`.
- [ ] Every `task_id` is unique in the file.
- [ ] Every task has a `geometry` and `properties.title`, and `properties.description` (may be empty).
- [ ] Coordinates are `[lon, lat]`, lon in -180..180 and lat in -90..90.
- [ ] Every `osm` entry is `node/<id>`, `way/<id>` or `relation/<id>`, with no duplicates.
- [ ] Every `links` entry starts with `https://`.
- [ ] Every task has at most 10 options, and their ids are unique within the task.
- [ ] Every `tag` option (no `action`) has `set` and/or `remove` with at least one entry.
- [ ] No key is in both `set` and `remove` of the same option.
- [ ] Every `create` option has tags in `set`, and a `Point`, `LineString` or one-ring `Polygon` as its or its task's geometry.
- [ ] Every `delete` option has features to delete, nodes and ways only, all of them in its task's `osm`.
- [ ] No `set` key or value is empty.
- [ ] Titles are 1 to 200 characters; descriptions are at most 10 000 characters.

Validate with the repository's checker, from the repository root:

```
bun run tasks-check <file.geojson>
```

It prints the errors with their paths (for example `features[3].properties.osm[0]`), writes
`reports/tasks-check.json`, and exits 1 when there is any error. Fix every error and run it again until it exits 0.
The JSON Schema of the structure is in `packages/tasks/task-file.schema.json` for editors; the checker also checks
what the schema cannot state (unique ids, a key both set and removed).

## Common mistakes

- **Coordinates in the wrong order.** GeoJSON is `[longitude, latitude]`. Latitude first puts Berlin in the wrong place
  (Berlin is about `[13.4, 52.5]`).
- **Raw HTML** in a description (`<b>`, `<a href=...>`). Write Markdown only. The format does not allow raw HTML; the
  checker does not reject it yet, so check for it yourself.
- **`http://` links**, or relative links, in `links`. Only `https://`.
- **Duplicate `task_id`**, especially when tasks are generated in batches and the counter restarts.
- **Duplicate `osm` entries** in one task.
- **An option that sets and removes the same key**, for example `"set": {"highway": "cycleway"}, "remove": ["highway"]`.
- **An empty value** such as `"set": {"maxspeed": ""}`. To delete a tag, put its key in `remove`.
- **An option with neither `set` nor `remove`**, or with both empty.
- **A `create` option with `remove`**, or a `delete` option with `set`: each action takes only its own fields.
- **A `delete` option for a relation**, or for a feature that is not in the task's `osm`.
- **`"action": "move"`** or any other action: only `tag`, `create` and `delete` exist.
- **`version` as a string** (`"1"`) or any value other than `1`.
- **Missing `description`** on a task or on the list. Use `""` when there is nothing to say.
- **A ring that is not closed** in a `Polygon`: the last position must equal the first.
- **Too many tasks.** One file holds at most 20 000 tasks; split a larger list into several files, each with its own `list_id`.
- **Comments or trailing commas** in the JSON.
