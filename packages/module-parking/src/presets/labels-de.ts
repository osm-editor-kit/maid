/**
 * German labels of the parking presets, fields and option values. `withGermanLabels` (german.ts) puts them into the
 * preset data when the visit is German.
 *
 * Why a map: `PresetChanges` takes English texts only (packages/presets/README.md, "Other languages"), so the
 * German names cannot go into the changes. The German words are also in the new presets' `terms` (so the search finds
 * them in English too). Values are the labels of the project's JOSM presets (parkraumprojekt.xml,
 * `de.display_value`) where they have one, else a plain translation.
 *
 * Keys: `presets` by preset id, `fields` by field id, `options` by field id and option value.
 */
const SURFACE = {
  asphalt: 'Asphalt',
  concrete: 'Beton',
  'concrete:plates': 'Betonplatten',
  paving_stones: 'Verbundsteine',
  sett: 'Pflastersteine',
  compacted: 'verdichtete Deckschicht',
  ground: 'Boden',
} as const

const MAXSTAY = {
  '5 minutes': '5 Minuten',
  '15 minutes': '15 Minuten',
  '30 minutes': '30 Minuten',
  '1 hour': '1 Stunde',
  '2 hours': '2 Stunden',
  '3 hours': '3 Stunden',
  '24 hours': '24 Stunden',
  '7 days': '7 Tage',
} as const

const SIDES = { both: 'beide Seiten', left: 'links', right: 'rechts' } as const

export const LABELS_DE = {
  presets: {
    'amenity/parking/street-side': 'Parkplatz (Parkbucht)',
    'parking/area/disabled_permit': 'Behindertenparkplatz mit Ausweisnummer',
    'parking/entrance_underground': 'Tiefgarageneinfahrt',
    'parking/obstacle': 'Hindernis im Parkbereich',
    'parking/area/lane': 'Parkplatz (Fahrbahn)',
    'parking/area/on_kerb': 'Parkplatz (ganz auf dem Gehweg)',
    'parking/area/half_on_kerb': 'Parkplatz (halb auf dem Gehweg)',
    // iD's presets with the tags of the project's Einfahrt, Abgesenkter Bordstein and Querungsstelle
    'highway/service/driveway': 'Einfahrt',
    'barrier/kerb/lowered': 'Abgesenkter Bordstein',
    'highway/crossing': 'Querungsstelle',
  },
  fields: {
    'parking/side/parking': 'Parkposition',
    'parking/side/orientation': 'Ausrichtung',
    'parking/side/restriction': 'Einschränkung',
    'parking/side/restriction_reason': 'Grund der Einschränkung',
    'parking/side/reason': 'Grund (kein Parken)',
    'parking/side/fee': 'Gebühr',
    'parking/side/fee_conditional': 'Gebühr (bedingt)',
    'parking/side/zone': 'Parkzone',
    'parking/side/maxstay': 'Höchstparkdauer',
    'parking/side/maxstay_conditional': 'Höchstparkdauer (bedingt)',
    'parking/side/markings': 'Markierung',
    'parking/side/access': 'Zugang zum Parken',
    'parking/side/access_conditional': 'Zugang zum Parken (bedingt)',
    'parking/side/informal': 'Informell (unbefestigter Seitenstreifen)',
    'parking/side/staggered': 'Versetztes Parken (abwechselnd)',
    'parking/side/width': 'Breite des Parkstreifens',
    'parking/side/capacity': 'Anzahl Stellplätze',
    'parking/side/surface': 'Belag des Parkstreifens',
    'parking/area/parking': 'Parkart',
    'parking/area/surface': 'Belag',
    'parking/area/fee': 'Gebühr',
    'parking/area/fee_conditional': 'Gebühr (bedingt)',
    'parking/area/maxstay': 'Höchstparkdauer',
    'parking/area/maxstay_conditional': 'Höchstparkdauer (bedingt)',
    'parking/area/access': 'Zugang',
    'parking/area/access_conditional': 'Zugang (bedingt)',
    'parking/area/restriction': 'Einschränkung',
    'parking/area/zone': 'Zone',
    'parking/area/markings': 'Markierung',
    crossing: 'Querungsart',
    'parking/crossing/kerb_extension': 'Gehwegvorstreckung',
    'parking/crossing/buffer_marking': 'Markierter Schutzstreifen',
    'parking/crossing/buffer_protection': 'Schutz des Schutzstreifens',
    'parking/area/vehicle/motorcar': 'Nur Pkw (beschildert)',
    'parking/area/vehicle/motorcycle': 'Nur Krafträder (beschildert)',
    'parking/area/vehicle/motorhome': 'Nur Wohnmobile (beschildert)',
    'parking/area/vehicle/goods': 'Nur Lieferfahrzeuge (beschildert)',
    'parking/area/vehicle/hgv': 'Nur Lkw (beschildert)',
    'parking/area/vehicle/hgv_articulated': 'Nur Sattelzüge (beschildert)',
    'parking/area/vehicle/bus': 'Nur Busse (beschildert)',
    'parking/area/vehicle/taxi': 'Nur Taxis (beschildert)',
    'parking/area/vehicle/disabled': 'Nur Menschen mit Behinderung (beschildert)',
  },
  options: {
    'parking/side/parking': {
      lane: 'Fahrbahn',
      street_side: 'Parkbucht',
      on_kerb: 'ganz auf dem Gehweg',
      half_on_kerb: 'halb auf dem Gehweg',
      shoulder: 'Seitenstreifen (unbefestigt)',
      separate: 'separat (eigene Parkfläche)',
      no: 'kein Parken',
      yes: 'ja (Art unbekannt)',
    },
    'parking/side/orientation': {
      parallel: 'Längsparken',
      diagonal: 'Schrägparken',
      perpendicular: 'Querparken',
    },
    'parking/side/restriction': {
      no_parking: 'Parkverbot',
      no_stopping: 'Halteverbot',
      loading_only: 'nur Be- und Entladen',
      charging_only: 'nur Laden',
    },
    'parking/side/restriction_reason': { bus_lane: 'Busspur' },
    'parking/side/reason': {
      curve: 'Kurve',
      narrow: 'zu schmal',
      construction: 'Baustelle',
      structure: 'Bauwerk',
      dual_carriage: 'getrennte Fahrbahnen',
    },
    'parking/side/fee': { yes: 'ja', no: 'nein' },
    'parking/side/markings': { yes: 'ja', no: 'nein' },
    'parking/side/informal': { yes: 'ja', no: 'nein' },
    'parking/side/access': {
      yes: 'yes (öffentlich)',
      private: 'private (privat)',
      permissive: 'permissive (geduldet)',
      customers: 'customers (Kunden)',
      no: 'no (nicht nutzbar)',
    },
    'parking/side/surface': SURFACE,
    'parking/side/maxstay': MAXSTAY,
    'parking/area/parking': {
      street_side: 'Parkbucht',
      lane: 'Fahrbahn',
      on_kerb: 'ganz auf dem Gehweg',
      half_on_kerb: 'halb auf dem Gehweg',
    },
    'parking/area/surface': SURFACE,
    'parking/area/fee': { yes: 'ja', no: 'nein' },
    'parking/area/maxstay': MAXSTAY,
    'parking/area/access': {
      yes: 'yes (öffentlich)',
      private: 'private (privat)',
      permissive: 'permissive (geduldet)',
      customers: 'customers (Kunden)',
      no: 'no (nicht nutzbar)',
    },
    'parking/area/restriction': {
      no_parking: 'Parkverbot',
      no_stopping: 'Halteverbot',
      loading_only: 'nur Be- und Entladen',
      charging_only: 'nur Laden',
    },
    'parking/area/markings': { yes: 'ja', no: 'nein' },
    crossing: {
      unmarked: 'unmarkiert',
      marked: 'markiert',
      traffic_signals: 'Ampel',
    },
    'parking/crossing/kerb_extension': SIDES,
    'parking/crossing/buffer_marking': SIDES,
    'parking/crossing/buffer_protection': SIDES,
  },
} as const
