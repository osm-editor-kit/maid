import type { RulesetsInput } from '@osm-editor-kit/maid-model'

/** The model's `osm_rulesets.json5` (Rapid's tagging rules) as a module, because Vite reads no JSON5. Generated: see schema.test.ts. */
export const osmRulesets: RulesetsInput = {
  assetID: 'osm_rulesets',
  scopes: [
    {
      scope: 'osm',
      variables: {
        lifecycle_prefixes: [
          'abandoned',
          'construction',
          'demolished',
          'destroyed',
          'dismantled',
          'disused',
          'intermittent',
          'obliterated',
          'planned',
          'proposed',
          'razed',
          'removed',
          'was',
        ],
        major_highway_values: [
          'motorway',
          'trunk',
          'primary',
          'secondary',
          'tertiary',
          'unclassified',
          'residential',
          'living_street',
          'road',
          'motorway_link',
          'trunk_link',
          'primary_link',
          'secondary_link',
          'tertiary_link',
        ],
        minor_highway_values: ['service', 'track', 'busway', 'bus_guideway'],
        path_highway_values: [
          'path',
          'footway',
          'cycleway',
          'bridleway',
          'pedestrian',
          'corridor',
          'elevator',
          'ladder',
          'steps',
          'via_ferrata',
        ],
        crossing_sync_keys: [
          'crossing',
          'crossing_ref',
          'crossing:continuous',
          'crossing:island',
          'crossing:markings',
          'crossing:signals',
        ],
        crossing_preserve_keys: ['crossing_ref', 'crossing:continuous', 'crossing:island'],
        private_building_values: [
          'detached',
          'farm',
          'house',
          'houseboat',
          'residential',
          'semidetached_house',
          'static_caravan',
        ],
        public_feature_keys: [
          'amenity',
          'craft',
          'historic',
          'leisure',
          'office',
          'shop',
          'tourism',
        ],
        personal_data_keys: [
          'contact:email',
          'contact:fax',
          'contact:phone',
          'email',
          'fax',
          'phone',
        ],
      },
      rulesets: {
        surface_paved: {
          include: [
            {
              key: 'surface',
              op: 'in',
              value: [
                'paved',
                'asphalt',
                'concrete',
                'chipseal',
                'concrete:lanes',
                'concrete:plates',
                'tiles',
              ],
            },
            {
              key: 'tracktype',
              value: 'grade1',
            },
          ],
        },
        surface_semipaved: {
          include: [
            {
              key: 'surface',
              op: 'in',
              value: [
                'bricks',
                'cobblestone',
                'cobblestone:flattened',
                'unhewn_cobblestone',
                'sett',
                'paving_stones',
                'grass_paver',
                'metal',
                'metal_grid',
                'fibre_reinforced_polymer_grate',
                'wood',
              ],
            },
          ],
        },
        oneway_forward: {
          include: [
            {
              key: 'aerialway',
              op: 'in',
              value: [
                'chair_lift',
                'drag_lift',
                'j-bar',
                'magic_carpet',
                'mixed_lift',
                'platter',
                'rope_tow',
                't-bar',
                'zip_line',
              ],
            },
            {
              key: 'conveying',
              value: 'forward',
            },
            {
              key: 'flow_direction',
              value: 'forward',
            },
            {
              key: 'golf',
              value: 'hole',
            },
            {
              key: 'highway',
              value: 'motorway',
            },
            {
              key: 'junction',
              op: 'in',
              value: ['circular', 'roundabout'],
            },
            {
              key: 'man_made',
              op: 'in',
              value: ['goods_conveyor', 'piste:halfpipe'],
            },
            {
              key: 'oneway',
              op: 'in',
              value: ['yes', '1'],
            },
            {
              key: 'piste:type',
              op: 'in',
              value: ['downhill', 'sled', 'yes'],
            },
            {
              key: 'roller_coaster',
              value: 'track',
            },
            {
              key: 'seamark:type',
              op: 'in',
              value: [
                'two-way_route',
                'recommended_traffic_lane',
                'separation_lane',
                'separation_roundabout',
              ],
            },
            {
              key: 'waterway',
              op: 'in',
              value: [
                'canal',
                'ditch',
                'drain',
                'fish_pass',
                'flowline',
                'pressurised',
                'river',
                'spillway',
                'stream',
                'tidal_channel',
              ],
            },
          ],
          exclude: [
            {
              key: 'oneway',
              op: 'in',
              value: ['no', '0', 'unknown'],
            },
            {
              key: 'flow_direction',
              op: 'in',
              value: ['no', '0', 'unknown'],
            },
          ],
        },
        oneway_backward: {
          include: [
            {
              key: 'conveying',
              value: 'backward',
            },
            {
              key: 'flow_direction',
              value: 'backward',
            },
            {
              key: 'oneway',
              value: '-1',
            },
          ],
          exclude: [
            {
              key: 'oneway',
              op: 'in',
              value: ['no', '0', 'unknown'],
            },
            {
              key: 'flow_direction',
              op: 'in',
              value: ['no', '0', 'unknown'],
            },
          ],
        },
        oneway_bidirectional: {
          include: [
            {
              key: 'conveying',
              value: 'reversible',
            },
            {
              key: 'oneway',
              op: 'in',
              value: ['alternating', 'reversible'],
            },
            {
              key: 'flow_direction',
              value: 'both',
            },
          ],
          exclude: [
            {
              key: 'oneway',
              op: 'in',
              value: ['no', '0', 'unknown'],
            },
            {
              key: 'flow_direction',
              op: 'in',
              value: ['no', '0', 'unknown'],
            },
          ],
        },
        sided_right: {
          include: [
            {
              key: 'barrier',
              op: 'in',
              value: ['retaining_wall', 'kerb', 'guard_rail', 'city_wall'],
            },
            {
              key: 'man_made',
              op: 'in',
              value: ['embankment', 'quay'],
            },
            {
              key: 'natural',
              op: 'in',
              value: ['cliff', 'coastline'],
            },
            {
              key: 'waterway',
              op: 'in',
              value: ['dam', 'weir'],
            },
          ],
          exclude: [
            {
              key: 'two_sided',
              value: 'yes',
            },
          ],
        },
        major_vehicular: {
          include: [
            {
              key: 'highway',
              op: 'in',
              value: 'var(major_highway_values)',
            },
          ],
        },
        minor_vehicular: {
          include: [
            {
              key: 'highway',
              op: 'in',
              value: 'var(minor_highway_values)',
            },
          ],
        },
        path_highway: {
          include: [
            {
              key: 'highway',
              op: 'in',
              value: 'var(path_highway_values)',
            },
          ],
        },
        connected_highway: {
          include: [
            {
              key: 'highway',
              op: 'in',
              value: 'var(major_highway_values, minor_highway_values, path_highway_values)',
            },
          ],
        },
        connected_aeroway: {
          include: [
            {
              key: 'aeroway',
              op: 'in',
              value: ['runway', 'taxiway'],
            },
          ],
        },
        connected_railway: {
          include: [
            {
              key: 'railway',
              op: 'in',
              value: [
                'rail',
                'light_rail',
                'tram',
                'subway',
                'monorail',
                'funicular',
                'miniature',
                'narrow_gauge',
                'disused',
                'preserved',
              ],
            },
          ],
        },
        connected_waterway: {
          include: [
            {
              key: 'waterway',
              op: 'in',
              value: [
                'canal',
                'ditch',
                'drain',
                'fish_pass',
                'flowline',
                'river',
                'stream',
                'tidal_channel',
              ],
            },
          ],
        },
        filter_aerialway: {
          include: [
            {
              key: 'aerialway',
              op: 'exists',
            },
          ],
          exclude: [
            {
              key: 'aerialway',
              op: 'in',
              value: ['yes', 'station'],
            },
          ],
        },
        filter_boundary: {
          include: [
            {
              key: 'boundary',
              op: 'exists',
            },
          ],
          exclude: [
            {
              key: 'highway',
              op: 'in',
              value: 'var(major_highway_values, minor_highway_values, path_highway_values)',
            },
            {
              key: 'waterway',
              op: 'exists',
            },
            {
              key: 'railway',
              op: 'exists',
            },
            {
              key: 'landuse',
              op: 'exists',
            },
            {
              key: 'natural',
              op: 'exists',
            },
            {
              key: 'building',
              op: 'exists',
            },
            {
              key: 'power',
              op: 'exists',
            },
          ],
        },
        filter_building: {
          include: [
            {
              key: 'building',
              value: '*',
            },
            {
              key: 'parking',
              op: 'in',
              value: ['multi-storey', 'sheds', 'carports', 'garage_boxes'],
            },
          ],
        },
        filter_building_part: {
          include: [
            {
              key: 'building:part',
              op: 'exists',
            },
          ],
        },
        filter_indoor: {
          include: [
            {
              key: 'indoor',
              op: 'exists',
            },
          ],
        },
        filter_landuse: {
          include: [
            {
              key: 'amenity',
              op: 'in',
              value: [
                'bicycle_parking',
                'college',
                'grave_yard',
                'hospital',
                'marketplace',
                'motorcycle_parking',
                'parking',
                'place_of_worship',
                'prison',
                'school',
                'university',
              ],
            },
            {
              key: 'landuse',
              op: 'exists',
            },
            {
              key: 'leisure',
              op: 'exists',
            },
            {
              key: 'natural',
              op: 'exists',
            },
          ],
          exclude: [
            {
              key: 'building',
              op: 'exists',
            },
            {
              key: 'building:part',
              op: 'exists',
            },
            {
              key: 'indoor',
              op: 'exists',
            },
            {
              key: 'waterway',
              op: 'exists',
            },
            {
              key: 'natural',
              op: 'in',
              value: ['water', 'coastline', 'bay'],
            },
            {
              key: 'landuse',
              op: 'in',
              value: ['pond', 'basin', 'reservoir', 'salt_pond'],
            },
            {
              key: 'aerialway',
              op: 'exists',
            },
          ],
        },
        filter_piste: {
          include: [
            {
              key: 'piste:type',
              op: 'exists',
            },
          ],
        },
        filter_rail: {
          include: [
            {
              key: 'railway',
              op: 'exists',
            },
            {
              key: 'landuse',
              value: 'railway',
            },
          ],
          exclude: [
            {
              key: 'highway',
              op: 'in',
              value: 'var(major_highway_values, minor_highway_values, path_highway_values)',
            },
          ],
        },
        filter_power: {
          include: [
            {
              key: 'power',
              op: 'exists',
            },
          ],
        },
        filter_water: {
          include: [
            {
              key: 'waterway',
              op: 'exists',
            },
            {
              key: 'natural',
              op: 'in',
              value: ['water', 'coastline', 'bay'],
            },
            {
              key: 'landuse',
              op: 'in',
              value: ['pond', 'basin', 'reservoir', 'salt_pond'],
            },
          ],
        },
        areakeys_force_true: {
          include: [
            {
              key: 'amenity',
              value: 'bicycle_parking',
            },
            {
              key: 'highway',
              op: 'in',
              value: ['elevator', 'rest_area', 'services'],
            },
            {
              key: 'public_transport',
              value: 'platform',
            },
            {
              key: 'railway',
              op: 'in',
              value: [
                'platform',
                'roundhouse',
                'station',
                'traverser',
                'turntable',
                'ventilation_shaft',
                'wash',
              ],
            },
            {
              key: 'traffic_calming',
              value: 'island',
            },
            {
              key: 'waterway',
              value: 'dam',
            },
          ],
        },
        areakeys_force_false: {
          include: [
            {
              key: 'emergency',
              op: 'in',
              value: ['yes', 'no', 'private', 'designated', 'destination', 'official'],
            },
          ],
        },
        lifecycle: {
          include: [
            {
              keyOp: '~',
              key: '^abandoned:',
            },
            {
              keyOp: '~',
              key: '^construction:',
            },
            {
              keyOp: '~',
              key: '^demolished:',
            },
            {
              keyOp: '~',
              key: '^destroyed:',
            },
            {
              keyOp: '~',
              key: '^dismantled:',
            },
            {
              keyOp: '~',
              key: '^disused:',
            },
            {
              keyOp: '~',
              key: '^intermittent:',
            },
            {
              keyOp: '~',
              key: '^obliterated:',
            },
            {
              keyOp: '~',
              key: '^planned:',
            },
            {
              keyOp: '~',
              key: '^proposed:',
            },
            {
              keyOp: '~',
              key: '^razed:',
            },
            {
              keyOp: '~',
              key: '^removed:',
            },
            {
              keyOp: '~',
              key: '^was:',
            },
          ],
        },
        uninteresting: {
          include: [
            {
              key: 'attribution',
            },
            {
              key: 'created_by',
            },
            {
              key: 'import_uuid',
            },
            {
              keyOp: '~',
              key: '^geobase:(datasetName|uuid)$',
            },
            {
              keyOp: '~',
              key: '^KSJ2:(curve_id|lat|long)$',
            },
            {
              keyOp: '~',
              key: '^lat(itude)?$',
            },
            {
              keyOp: '~',
              key: '^lon(gitude)?$',
            },
            {
              keyOp: '~',
              key: '^odbl(:note)?$',
            },
            {
              keyOp: '~',
              key: '^source(_ref)?(:|$)',
            },
            {
              keyOp: '~',
              key: '^tiger:',
            },
          ],
        },
      },
    },
  ],
}
