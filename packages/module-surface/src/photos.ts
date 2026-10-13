/**
 * The catalogue's photos, keyed by the package-relative paths the catalogue uses (images/). The vehicle pictures of
 * the smoothness levels are emoji now and are not files. Each file is imported from the data package, so the bundler
 * emits it as a file of Maid's own origin: nothing is loaded from the network at run time. Generated from the
 * package's dist/generated/images folder (one import per file); test: photos.test.ts checks that every path the
 * catalogue names is here.
 *
 * The `?no-inline` suffix keeps Vite from inlining a file into the JavaScript as a data URI, whatever its size.
 * Bun's test runner accepts the suffix and returns the file path.
 */
import pic_surface_acrylic_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_acrylic.jpg?no-inline'
import pic_surface_artificial_turf_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_artificial_turf.jpg?no-inline'
import pic_surface_asphalt_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_asphalt.jpg?no-inline'
import pic_surface_asphalt_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_asphalt_bad.jpg?no-inline'
import pic_surface_asphalt_excellent_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_asphalt_excellent.jpg?no-inline'
import pic_surface_asphalt_good_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_asphalt_good.jpg?no-inline'
import pic_surface_asphalt_intermediate_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_asphalt_intermediate.jpg?no-inline'
import pic_surface_asphalt_very_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_asphalt_very_bad.jpg?no-inline'
import pic_surface_cobblestone_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_cobblestone.jpg?no-inline'
import pic_surface_compacted_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_compacted.jpg?no-inline'
import pic_surface_compacted_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_compacted_bad.jpg?no-inline'
import pic_surface_compacted_good_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_compacted_good.jpg?no-inline'
import pic_surface_compacted_intermediate_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_compacted_intermediate.jpg?no-inline'
import pic_surface_compacted_very_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_compacted_very_bad.jpg?no-inline'
import pic_surface_concrete_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete.jpg?no-inline'
import pic_surface_concrete_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete_bad.jpg?no-inline'
import pic_surface_concrete_excellent_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete_excellent.jpg?no-inline'
import pic_surface_concrete_good_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete_good.jpg?no-inline'
import pic_surface_concrete_intermediate_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete_intermediate.jpg?no-inline'
import pic_surface_concrete_lanes_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete_lanes.jpg?no-inline'
import pic_surface_concrete_very_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_concrete_very_bad.jpg?no-inline'
import pic_surface_dirt_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_dirt.jpg?no-inline'
import pic_surface_fine_gravel_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_fine_gravel.jpg?no-inline'
import pic_surface_grass_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_grass.jpg?no-inline'
import pic_surface_grass_paver_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_grass_paver.jpg?no-inline'
import pic_surface_gravel_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_gravel.jpg?no-inline'
import pic_surface_gravel_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_gravel_bad.jpg?no-inline'
import pic_surface_gravel_intermediate_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_gravel_intermediate.jpg?no-inline'
import pic_surface_gravel_very_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_gravel_very_bad.jpg?no-inline'
import pic_surface_ground_area_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_ground_area.jpg?no-inline'
import pic_surface_metal_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_metal.jpg?no-inline'
import pic_surface_mud_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_mud.jpg?no-inline'
import pic_surface_paved_area_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paved_area.jpg?no-inline'
import pic_surface_paving_stones_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paving_stones.jpg?no-inline'
import pic_surface_paving_stones_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paving_stones_bad.jpg?no-inline'
import pic_surface_paving_stones_excellent_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paving_stones_excellent.jpg?no-inline'
import pic_surface_paving_stones_good_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paving_stones_good.jpg?no-inline'
import pic_surface_paving_stones_intermediate_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paving_stones_intermediate.jpg?no-inline'
import pic_surface_paving_stones_very_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_paving_stones_very_bad.jpg?no-inline'
import pic_surface_pebblestone_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_pebblestone.jpg?no-inline'
import pic_surface_rock_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_rock.jpg?no-inline'
import pic_surface_sand_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_sand.jpg?no-inline'
import pic_surface_sett_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_sett.jpg?no-inline'
import pic_surface_sett_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_sett_bad.jpg?no-inline'
import pic_surface_sett_good_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_sett_good.jpg?no-inline'
import pic_surface_sett_intermediate_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_sett_intermediate.jpg?no-inline'
import pic_surface_sett_very_bad_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_sett_very_bad.jpg?no-inline'
import pic_surface_tartan_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_tartan.jpg?no-inline'
import pic_surface_tennis_clay_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_tennis_clay.jpg?no-inline'
import pic_surface_unpaved_area_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_unpaved_area.jpg?no-inline'
import pic_surface_unpaved_horrible_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_unpaved_horrible.jpg?no-inline'
import pic_surface_unpaved_impassable_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_unpaved_impassable.jpg?no-inline'
import pic_surface_unpaved_very_horrible_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_unpaved_very_horrible.jpg?no-inline'
import pic_surface_wood_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_wood.jpg?no-inline'
import pic_surface_woodchips_jpg from '@osm-editor-kit/surface-smoothness-data/images/surface_woodchips.jpg?no-inline'

export const PICTURES: Readonly<Record<string, string>> = {
  'images/surface_acrylic.jpg': pic_surface_acrylic_jpg,
  'images/surface_artificial_turf.jpg': pic_surface_artificial_turf_jpg,
  'images/surface_asphalt.jpg': pic_surface_asphalt_jpg,
  'images/surface_asphalt_bad.jpg': pic_surface_asphalt_bad_jpg,
  'images/surface_asphalt_excellent.jpg': pic_surface_asphalt_excellent_jpg,
  'images/surface_asphalt_good.jpg': pic_surface_asphalt_good_jpg,
  'images/surface_asphalt_intermediate.jpg': pic_surface_asphalt_intermediate_jpg,
  'images/surface_asphalt_very_bad.jpg': pic_surface_asphalt_very_bad_jpg,
  'images/surface_cobblestone.jpg': pic_surface_cobblestone_jpg,
  'images/surface_compacted.jpg': pic_surface_compacted_jpg,
  'images/surface_compacted_bad.jpg': pic_surface_compacted_bad_jpg,
  'images/surface_compacted_good.jpg': pic_surface_compacted_good_jpg,
  'images/surface_compacted_intermediate.jpg': pic_surface_compacted_intermediate_jpg,
  'images/surface_compacted_very_bad.jpg': pic_surface_compacted_very_bad_jpg,
  'images/surface_concrete.jpg': pic_surface_concrete_jpg,
  'images/surface_concrete_bad.jpg': pic_surface_concrete_bad_jpg,
  'images/surface_concrete_excellent.jpg': pic_surface_concrete_excellent_jpg,
  'images/surface_concrete_good.jpg': pic_surface_concrete_good_jpg,
  'images/surface_concrete_intermediate.jpg': pic_surface_concrete_intermediate_jpg,
  'images/surface_concrete_lanes.jpg': pic_surface_concrete_lanes_jpg,
  'images/surface_concrete_very_bad.jpg': pic_surface_concrete_very_bad_jpg,
  'images/surface_dirt.jpg': pic_surface_dirt_jpg,
  'images/surface_fine_gravel.jpg': pic_surface_fine_gravel_jpg,
  'images/surface_grass.jpg': pic_surface_grass_jpg,
  'images/surface_grass_paver.jpg': pic_surface_grass_paver_jpg,
  'images/surface_gravel.jpg': pic_surface_gravel_jpg,
  'images/surface_gravel_bad.jpg': pic_surface_gravel_bad_jpg,
  'images/surface_gravel_intermediate.jpg': pic_surface_gravel_intermediate_jpg,
  'images/surface_gravel_very_bad.jpg': pic_surface_gravel_very_bad_jpg,
  'images/surface_ground_area.jpg': pic_surface_ground_area_jpg,
  'images/surface_metal.jpg': pic_surface_metal_jpg,
  'images/surface_mud.jpg': pic_surface_mud_jpg,
  'images/surface_paved_area.jpg': pic_surface_paved_area_jpg,
  'images/surface_paving_stones.jpg': pic_surface_paving_stones_jpg,
  'images/surface_paving_stones_bad.jpg': pic_surface_paving_stones_bad_jpg,
  'images/surface_paving_stones_excellent.jpg': pic_surface_paving_stones_excellent_jpg,
  'images/surface_paving_stones_good.jpg': pic_surface_paving_stones_good_jpg,
  'images/surface_paving_stones_intermediate.jpg': pic_surface_paving_stones_intermediate_jpg,
  'images/surface_paving_stones_very_bad.jpg': pic_surface_paving_stones_very_bad_jpg,
  'images/surface_pebblestone.jpg': pic_surface_pebblestone_jpg,
  'images/surface_rock.jpg': pic_surface_rock_jpg,
  'images/surface_sand.jpg': pic_surface_sand_jpg,
  'images/surface_sett.jpg': pic_surface_sett_jpg,
  'images/surface_sett_bad.jpg': pic_surface_sett_bad_jpg,
  'images/surface_sett_good.jpg': pic_surface_sett_good_jpg,
  'images/surface_sett_intermediate.jpg': pic_surface_sett_intermediate_jpg,
  'images/surface_sett_very_bad.jpg': pic_surface_sett_very_bad_jpg,
  'images/surface_tartan.jpg': pic_surface_tartan_jpg,
  'images/surface_tennis_clay.jpg': pic_surface_tennis_clay_jpg,
  'images/surface_unpaved_area.jpg': pic_surface_unpaved_area_jpg,
  'images/surface_unpaved_horrible.jpg': pic_surface_unpaved_horrible_jpg,
  'images/surface_unpaved_impassable.jpg': pic_surface_unpaved_impassable_jpg,
  'images/surface_unpaved_very_horrible.jpg': pic_surface_unpaved_very_horrible_jpg,
  'images/surface_wood.jpg': pic_surface_wood_jpg,
  'images/surface_woodchips.jpg': pic_surface_woodchips_jpg,
}
