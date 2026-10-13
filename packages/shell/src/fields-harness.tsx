/**
 * Dev-only harness for the fields of several features (packages/ui/src/inspector/fields, docs/research/multi-selection.md
 * 3.2). main.tsx loads this module only on the dev server, with `?harness=fields`, through a dynamic import, so a
 * production build does not contain it. It mounts PresetFields for a residential road with hand-written combined tags
 * for three features, and logs every onChange on `window.__fields`: the page has no map and no inspector.
 */
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { type CombinedTags, PresetFields } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'

/** The three features of the harness. The shared tags are the values all three share (lanes, maxspeed). */
const FEATURES: Tags[] = [
  {
    highway: 'residential',
    name: 'Main Street',
    oneway: 'yes',
    surface: 'asphalt',
    lanes: '2',
    maxspeed: '50',
    foot: 'yes',
    'cycleway:left': 'lane',
    'cycleway:right': 'no',
    wikidata: 'Q1',
  },
  {
    highway: 'residential',
    name: 'High Street',
    oneway: 'no',
    surface: 'paved',
    lanes: '2',
    maxspeed: '50',
    foot: 'no',
    'cycleway:left': 'shoulder',
    'cycleway:right': 'no',
    wikidata: 'Q2',
  },
  {
    highway: 'residential',
    name: 'Mill Lane',
    oneway: 'no',
    lanes: '2',
    maxspeed: '50',
    'cycleway:left': 'shoulder',
    wikidata: 'Q3',
  },
]

/** The combined tags of FEATURES, written by hand (the model's combinedTags gives the same shape). */
const COMBINED: CombinedTags = {
  name: { kind: 'mixed', values: ['Main Street', 'High Street', 'Mill Lane'], missing: false },
  oneway: { kind: 'mixed', values: ['no', 'yes'], missing: false },
  surface: { kind: 'mixed', values: ['asphalt', 'paved'], missing: true },
  lanes: { kind: 'one', value: '2' },
  maxspeed: { kind: 'one', value: '50' },
  foot: { kind: 'mixed', values: ['yes', 'no'], missing: true },
  'cycleway:left': { kind: 'mixed', values: ['shoulder', 'lane'], missing: false },
  'cycleway:right': { kind: 'mixed', values: ['no'], missing: true },
  wikidata: { kind: 'mixed', values: ['Q2', 'Q1', 'Q3'], missing: false },
  highway: { kind: 'one', value: 'residential' },
}

/** The shared tags: what all three share. A mixed key is absent. */
const SHARED: Tags = { highway: 'residential', lanes: '2', maxspeed: '50' }

const SURFACES = [
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'paved', label: 'Paved' },
  { value: 'gravel', label: 'Gravel' },
]

const SIDE_OPTIONS = [
  { value: 'lane', label: 'Lane' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'track', label: 'Track' },
  { value: 'no', label: 'None' },
]

const FIELDS: Field[] = [
  { id: 'name', type: 'text', key: 'name', label: 'Name', options: [], universal: true },
  {
    id: 'oneway',
    type: 'onewayCheck',
    key: 'oneway',
    label: 'One way',
    options: [],
    universal: false,
  },
  {
    id: 'surface',
    type: 'combo',
    key: 'surface',
    label: 'Surface',
    placeholder: 'Unknown',
    options: SURFACES,
    customValues: true,
    universal: false,
  },
  {
    id: 'lanes',
    type: 'number',
    key: 'lanes',
    label: 'Lanes',
    options: [],
    universal: false,
    minValue: 0,
  },
  {
    id: 'maxspeed',
    type: 'roadspeed',
    key: 'maxspeed',
    label: 'Maximum speed',
    options: [],
    universal: false,
  },
  {
    id: 'access',
    type: 'access',
    keys: ['access', 'foot', 'motor_vehicle', 'bicycle'],
    label: 'Access',
    options: [],
    universal: false,
  },
  {
    id: 'cycleway',
    type: 'directionalCombo',
    key: 'cycleway',
    label: 'Cycleway',
    options: SIDE_OPTIONS,
    universal: false,
  },
  // a type with no several-values control of its own: the generic mixed control
  {
    id: 'wikidata',
    type: 'wikidata',
    key: 'wikidata',
    label: 'Wikidata',
    options: [],
    universal: false,
  },
]

const probe: { calls: { key: string; value: string | undefined; at: number }[] } = { calls: [] }
Object.assign(window, {
  __fields: probe,
  // runCheck (tools/bench/check-page.ts) waits for this; the harness has no map to settle
  __bench: { ready: () => Promise.resolve(), settled: () => Promise.resolve() },
})

export function FieldsHarness() {
  const [calls, setCalls] = useState(probe.calls)
  return (
    <div className="mx-auto mt-8 w-[340px] px-4 text-zinc-950 dark:text-white">
      <PresetFields
        fields={FIELDS}
        tags={SHARED}
        combined={COMBINED}
        features={FEATURES}
        onChange={(key, value) => {
          probe.calls.push({ key, value, at: probe.calls.length })
          setCalls([...probe.calls])
        }}
      />
      <ol data-testid="calls" className="mt-6 font-mono text-xs text-zinc-500">
        {calls.map((call) => (
          <li key={call.at}>
            {call.key}={call.value ?? '(removed)'}
          </li>
        ))}
      </ol>
    </div>
  )
}
