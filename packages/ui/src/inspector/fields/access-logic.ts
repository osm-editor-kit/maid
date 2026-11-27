import { m } from '@osm-editor-kit/maid-i18n'
import type { Tags } from '@osm-editor-kit/maid-presets'
import DEFAULT_KEYS from './access-default-keys.json'

/**
 * The access keys of land transport in the order of the OSM wiki (Key:access, "Land-based transportation"),
 * from Tobias's iD pull request openstreetmap/iD#12011 (modules/ui/fields/access_keys.ts). The access field
 * shows the default keys of the feature (accessDefaultKeys) and every key of this list that is set or that was
 * added with the field's "+"; all rows follow this order.
 */
export const ACCESS_KEYS: readonly string[] = [
  'access',
  'foot',
  'dog',
  'ski',
  'ski:nordic',
  'ski:alpine',
  'ski:telemark',
  'inline_skates',
  'horse',
  'portage',
  'vehicle',
  'bicycle',
  'electric_bicycle',
  'mtb',
  'cargo_bike',
  'kick_scooter',
  'carriage',
  'cycle_rickshaw',
  'hand_cart',
  'trailer',
  'caravan',
  'motor_vehicle',
  'electric_vehicle',
  'motorcycle',
  'moped',
  'speed_pedelec',
  'mofa',
  'small_electric_vehicle',
  'motorcar',
  'motorhome',
  'tourist_bus',
  'coach',
  'goods',
  'hgv',
  'hgv_articulated',
  'bdouble',
  'agricultural',
  'auto_rickshaw',
  'nev',
  'golf_cart',
  'microcar',
  'atv',
  'ohv',
  'snowmobile',
  'psv',
  'bus',
  'taxi',
  'minibus',
  'share_taxi',
  'hov',
  'carpool',
  'car_sharing',
  'emergency',
  'hazmat',
  'hazmat:water',
  'school_bus',
  'disabled',
]

const ACCESS_KEY_SET = new Set(ACCESS_KEYS)
const ORDER = new Map(ACCESS_KEYS.map((key, index) => [key, index]))

/** Whether a tag key is one of the access keys (ACCESS_KEYS): the access field owns it. */
export function isAccessKey(key: string) {
  return ACCESS_KEY_SET.has(key)
}

type DefaultKeys = {
  default: string[]
  byTag: Record<string, Record<string, string[]>>
}

/**
 * The rows the field always shows for a feature (access-default-keys.json): the list of the first tag that has
 * one (highway=track adds horse, highway=cycleway moped and mofa, ...), else the default (access, foot, bicycle,
 * motor_vehicle). Several features: every key that one of them has by default.
 */
export function accessDefaultKeys(features: readonly Tags[], table: DefaultKeys = DEFAULT_KEYS) {
  const keys = new Set<string>()
  for (const tags of features.length > 0 ? features : [{}]) {
    const own = Object.entries(table.byTag)
      .map(([key, values]) => {
        const value = tags[key]
        return value !== undefined && Object.hasOwn(values, value) ? values[value] : undefined
      })
      .find((list) => list !== undefined)
    for (const key of own ?? table.default) keys.add(key)
  }
  return [...keys]
}

/**
 * Sorts keys in the wiki's order (ACCESS_KEYS): `keys` always, and every access key of `present`. A key the list
 * does not know (a fork's own) comes after them.
 */
export function accessRowKeys(keys: readonly string[], present: Iterable<string> = []) {
  const rows = new Set(keys)
  for (const key of present) if (isAccessKey(key)) rows.add(key)
  const rank = (key: string) => ORDER.get(key) ?? ACCESS_KEYS.length
  return [...rows].sort((a, b) => rank(a) - rank(b))
}

/** iD's keys of the access field (id-tagging-schema `access`): the field the JSON's defaults stand in for. */
const ID_FIELD_KEYS = ['access', 'foot', 'motor_vehicle', 'bicycle', 'horse']

const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key) => b.includes(key))

/**
 * The keys of an access field for a feature, as the PR's effectiveKeys: what its rows show and what its remove
 * and revert reach. iD's field (its five keys) gets the defaults of the JSON (accessDefaultKeys: no horse on a
 * residential road); a field with other keys (a fork's own) keeps them. Then every access key that is set,
 * was set before the edits (`baseTags`, for revert) or differs between the selected features. Never a key of
 * `excluded`: the preset's own tags and the keys of the feature's other fields.
 */
export function accessFieldKeys(
  fieldKeys: readonly string[],
  context: {
    tags: Tags
    features?: readonly Tags[]
    baseTags?: Tags
    /** Several features: the keys of the combined tags (mixed ones included) */
    combinedKeys?: readonly string[]
    excluded?: ReadonlySet<string>
  },
) {
  const { tags, features, baseTags, combinedKeys = [], excluded = new Set<string>() } = context
  const defaults = sameKeys(fieldKeys, ID_FIELD_KEYS)
    ? accessDefaultKeys(features !== undefined && features.length > 0 ? features : [tags])
    : fieldKeys
  const present = [
    ...Object.keys(tags).filter((key) => (tags[key] ?? '') !== ''),
    ...Object.keys(baseTags ?? {}).filter((key) => (baseTags?.[key] ?? '') !== ''),
    ...combinedKeys,
  ]
  return accessRowKeys(
    defaults.filter((key) => !excluded.has(key)),
    present.filter((key) => !excluded.has(key)),
  )
}

/**
 * The access keys that "+" can still add: every key of ACCESS_KEYS that is not a row yet and not `excluded` (a key
 * of the preset or of another field), in the wiki's order.
 */
export function addableAccessKeys(shown: readonly string[], excluded: readonly string[] = []) {
  const skip = new Set([...shown, ...excluded])
  return ACCESS_KEYS.filter((key) => !skip.has(key))
}

/** The label of each row (iD's `types.<key>`); read when a row is drawn, as the language is set at mount. */
const KEY_LABELS: Record<string, () => string> = {
  access: m.ui_access_access,
  foot: m.ui_access_foot,
  motor_vehicle: m.ui_access_motor_vehicle,
  bicycle: m.ui_access_bicycle,
  horse: m.ui_access_horse,
  dog: m.ui_access_key_dog,
  ski: m.ui_access_key_ski,
  'ski:nordic': m.ui_access_key_ski_nordic,
  'ski:alpine': m.ui_access_key_ski_alpine,
  'ski:telemark': m.ui_access_key_ski_telemark,
  inline_skates: m.ui_access_key_inline_skates,
  portage: m.ui_access_key_portage,
  vehicle: m.ui_access_key_vehicle,
  electric_bicycle: m.ui_access_key_electric_bicycle,
  mtb: m.ui_access_key_mtb,
  cargo_bike: m.ui_access_key_cargo_bike,
  kick_scooter: m.ui_access_key_kick_scooter,
  carriage: m.ui_access_key_carriage,
  cycle_rickshaw: m.ui_access_key_cycle_rickshaw,
  hand_cart: m.ui_access_key_hand_cart,
  trailer: m.ui_access_key_trailer,
  caravan: m.ui_access_key_caravan,
  electric_vehicle: m.ui_access_key_electric_vehicle,
  motorcycle: m.ui_access_key_motorcycle,
  moped: m.ui_access_key_moped,
  speed_pedelec: m.ui_access_key_speed_pedelec,
  mofa: m.ui_access_key_mofa,
  small_electric_vehicle: m.ui_access_key_small_electric_vehicle,
  motorcar: m.ui_access_key_motorcar,
  motorhome: m.ui_access_key_motorhome,
  tourist_bus: m.ui_access_key_tourist_bus,
  coach: m.ui_access_key_coach,
  goods: m.ui_access_key_goods,
  hgv: m.ui_access_key_hgv,
  hgv_articulated: m.ui_access_key_hgv_articulated,
  bdouble: m.ui_access_key_bdouble,
  agricultural: m.ui_access_key_agricultural,
  auto_rickshaw: m.ui_access_key_auto_rickshaw,
  nev: m.ui_access_key_nev,
  golf_cart: m.ui_access_key_golf_cart,
  microcar: m.ui_access_key_microcar,
  atv: m.ui_access_key_atv,
  ohv: m.ui_access_key_ohv,
  snowmobile: m.ui_access_key_snowmobile,
  psv: m.ui_access_key_psv,
  bus: m.ui_access_key_bus,
  taxi: m.ui_access_key_taxi,
  minibus: m.ui_access_key_minibus,
  share_taxi: m.ui_access_key_share_taxi,
  hov: m.ui_access_key_hov,
  carpool: m.ui_access_key_carpool,
  car_sharing: m.ui_access_key_car_sharing,
  emergency: m.ui_access_key_emergency,
  hazmat: m.ui_access_key_hazmat,
  'hazmat:water': m.ui_access_key_hazmat_water,
  school_bus: m.ui_access_key_school_bus,
  disabled: m.ui_access_key_disabled,
}

/** The label of an access key, in the UI's language. A key the list does not know shows as it is. */
export function accessKeyLabel(key: string) {
  return Object.hasOwn(KEY_LABELS, key) ? (KEY_LABELS[key]?.() ?? key) : key
}
