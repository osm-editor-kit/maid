# iD's unit tests: inventory

Counted by script from `.reference/id/test/spec` at iD commit `0194f3926`: `it(`/`test(` calls per file. The per-area files next to this one say what Maid has for each test and what is missing.

What the count does not see (checked 2026-10-13 in the iD files): `it.each` tables (`core/localizer.ts` 8 rows, `util/localizer.ts` 12 rows, `ui/fields/radio.ts` 5 rows); one `it.skip` (`ui/fields/wikipedia.js`); a loop that makes one `it` per case (`osm/node.js`: six invalid direction and side pairs, so the file runs 61 cases, not 56). The 10 in the `core/localizer.ts` row is unverified (2026-10-13): a grep finds 9 `it(` lines. `lib/locale.js` is a separate row; the core report adds it to `core` (210).

| Area | Files | Tests | Skipped in iD |
| --- | --- | --- | --- |
| actions | 35 | 509 | 0 |
| behavior | 4 | 26 | 0 |
| core | 8 | 207 | 1 |
| geo | 4 | 146 | 0 |
| lib | 1 | 3 | 1 |
| modes | 3 | 10 | 2 |
| operations | 4 | 44 | 0 |
| osm | 10 | 406 | 1 |
| presets | 4 | 80 | 2 |
| renderer | 4 | 68 | 0 |
| services | 10 | 156 | 3 |
| svg | 11 | 77 | 0 |
| ui | 18 | 118 | 2 |
| util | 10 | 137 | 1 |
| validations | 14 | 209 | 0 |
| **all** | 140 | **2196** | |

## actions

| File | Tests |
| --- | --- |
| `actions/add_entity.js` | 1 |
| `actions/add_member.js` | 8 |
| `actions/add_midpoint.js` | 4 |
| `actions/change_member.js` | 1 |
| `actions/change_preset.js` | 13 |
| `actions/change_tags.js` | 1 |
| `actions/circularize.js` | 16 |
| `actions/connect.js` | 23 |
| `actions/copy_entities.js` | 5 |
| `actions/delete_member.js` | 2 |
| `actions/delete_multiple.js` | 2 |
| `actions/delete_node.js` | 7 |
| `actions/delete_relation.js` | 10 |
| `actions/delete_way.js` | 8 |
| `actions/discard_tags.js` | 6 |
| `actions/disconnect.js` | 17 |
| `actions/extract.js` | 36 |
| `actions/join.js` | 42 |
| `actions/merge.js` | 7 |
| `actions/merge_nodes.js` | 11 |
| `actions/merge_polygon.js` | 12 |
| `actions/merge_remote_changes.js` | 27 |
| `actions/move.js` | 5 |
| `actions/move_node.js` | 5 |
| `actions/noop.js` | 1 |
| `actions/orthogonalize.js` | 40 |
| `actions/reflect.js` | 10 |
| `actions/restrict_turn.js` | 2 |
| `actions/reverse.js` | 64 |
| `actions/revert.js` | 13 |
| `actions/split.js` | 79 |
| `actions/straighten_nodes.js` | 5 |
| `actions/straighten_way.js` | 12 |
| `actions/unrestrict_turn.js` | 1 |
| `actions/upgrade_tags.js` | 13 |

## behavior

| File | Tests |
| --- | --- |
| `behavior/hash.js` | 9 |
| `behavior/hover.js` | 8 |
| `behavior/lasso.js` | 1 |
| `behavior/select.js` | 8 |

## core

| File | Tests |
| --- | --- |
| `core/context.js` | 8 |
| `core/difference.js` | 44 |
| `core/file_fetcher.js` | 5 |
| `core/graph.js` | 62 |
| `core/history.js` | 55 |
| `core/localizer.ts` | 10 |
| `core/tree.js` | 17 |
| `core/validator.js` | 6 |

## geo

| File | Tests |
| --- | --- |
| `geo/extent.js` | 41 |
| `geo/geo.js` | 25 |
| `geo/geom.js` | 54 |
| `geo/vector.js` | 26 |

## lib

| File | Tests |
| --- | --- |
| `lib/locale.js` | 3 |

## modes

| File | Tests |
| --- | --- |
| `modes/add_note.js` | 0 |
| `modes/add_point.js` | 2 |
| `modes/select.js` | 8 |

## operations

| File | Tests |
| --- | --- |
| `operations/circularize.js` | 11 |
| `operations/delete.js` | 4 |
| `operations/extract.js` | 14 |
| `operations/straighten.js` | 15 |

## osm

| File | Tests |
| --- | --- |
| `osm/changeset.js` | 10 |
| `osm/deprecated.ts` | 9 |
| `osm/entity.js` | 41 |
| `osm/intersection.js` | 51 |
| `osm/multipolygon.js` | 13 |
| `osm/node.js` | 56 |
| `osm/note.js` | 5 |
| `osm/relation.js` | 80 |
| `osm/tags.js` | 3 |
| `osm/way.js` | 138 |

## presets

| File | Tests |
| --- | --- |
| `presets/category.js` | 2 |
| `presets/collection.js` | 16 |
| `presets/index.js` | 27 |
| `presets/preset.js` | 35 |

## renderer

| File | Tests |
| --- | --- |
| `renderer/background_source.js` | 16 |
| `renderer/features.js` | 27 |
| `renderer/map.js` | 23 |
| `renderer/tile_layer.js` | 2 |

## services

| File | Tests |
| --- | --- |
| `services/kartaview.js` | 9 |
| `services/mapillary.js` | 11 |
| `services/maprules.js` | 29 |
| `services/nominatim.js` | 5 |
| `services/osm.js` | 45 |
| `services/osm_wikibase.js` | 11 |
| `services/panoramax.js` | 11 |
| `services/streetside.js` | 7 |
| `services/taginfo.js` | 20 |
| `services/vegbilder.js` | 8 |

## svg

| File | Tests |
| --- | --- |
| `svg/areas.js` | 9 |
| `svg/data.js` | 7 |
| `svg/icon.js` | 2 |
| `svg/layers.js` | 3 |
| `svg/lines.js` | 14 |
| `svg/midpoints.js` | 5 |
| `svg/osm.js` | 2 |
| `svg/points.js` | 1 |
| `svg/svg.js` | 2 |
| `svg/tag_classes.js` | 31 |
| `svg/vertices.js` | 1 |

## ui

| File | Tests |
| --- | --- |
| `ui/account.js` | 1 |
| `ui/cmd.js` | 4 |
| `ui/combobox.js` | 20 |
| `ui/confirm.js` | 10 |
| `ui/entity_editor.js` | 1 |
| `ui/flash.js` | 1 |
| `ui/inspector.js` | 0 |
| `ui/modal.js` | 6 |
| `ui/multiCombo.ts` | 18 |
| `ui/view_on_osm.js` | 1 |
| `ui/sections/background_list.js` | 3 |
| `ui/sections/raw_tag_editor.js` | 4 |
| `ui/fields/access.js` | 14 |
| `ui/fields/combo.ts` | 3 |
| `ui/fields/directional_combo.js` | 11 |
| `ui/fields/localized.js` | 10 |
| `ui/fields/radio.ts` | 1 |
| `ui/fields/wikipedia.js` | 10 |

## util

| File | Tests |
| --- | --- |
| `util/aes.ts` | 5 |
| `util/array.js` | 13 |
| `util/clean_tags.js` | 7 |
| `util/keybinding.js` | 10 |
| `util/localizer.ts` | 0 |
| `util/object.ts` | 4 |
| `util/rebind.js` | 1 |
| `util/session_mutex.js` | 10 |
| `util/units.js` | 13 |
| `util/util.js` | 74 |

## validations

| File | Tests |
| --- | --- |
| `validations/almost_junction.js` | 10 |
| `validations/crossing_ways.js` | 82 |
| `validations/disconnected_way.js` | 10 |
| `validations/impossible_oneway.js` | 9 |
| `validations/incompatible_source.js` | 7 |
| `validations/invalid_format.js` | 19 |
| `validations/mismatched_geometry.js` | 14 |
| `validations/missing_role.js` | 7 |
| `validations/missing_tag.js` | 9 |
| `validations/mutually_exclusive_tags.js` | 5 |
| `validations/osm_api_limits.js` | 4 |
| `validations/outdated_tags.js` | 13 |
| `validations/private_data.js` | 6 |
| `validations/suspicious_name.js` | 14 |
