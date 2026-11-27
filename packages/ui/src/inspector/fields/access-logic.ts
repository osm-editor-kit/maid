import { m } from '@osm-editor-kit/maid-i18n'

/**
 * The access keys of land transport in the order of the OSM wiki (Key:access, "Land-based transportation"),
 * from Tobias's iD pull request openstreetmap/iD#12011 (modules/ui/fields/access_keys.ts). The access field
 * shows its own keys (the preset's, iD's default five) and every key of this list that is set or that was
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

/**
 * The keys the access field shows as rows: its own keys (`fieldKeys`, always), then every access key that is
 * in `present` (keys set on the features, mixed keys, rows added with "+"). Sorted in the wiki's order
 * (ACCESS_KEYS); a key of the field that the list does not know keeps its place after them.
 */
export function accessRowKeys(fieldKeys: readonly string[], present: Iterable<string>) {
  const keys = new Set(fieldKeys)
  for (const key of present) if (isAccessKey(key)) keys.add(key)
  const rank = (key: string) => ORDER.get(key) ?? ACCESS_KEYS.length
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

/** The access keys that "+" can still add: every key of ACCESS_KEYS that is not a row yet, in the wiki's order. */
export function addableAccessKeys(shown: readonly string[]) {
  const rows = new Set(shown)
  return ACCESS_KEYS.filter((key) => !rows.has(key))
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
