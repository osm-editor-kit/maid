/**
 * Dev-only harness for the browser check of the Tags sheet (tools/bench/tags-check.ts). main.tsx loads this module
 * only on the dev server, with `?harness=tags`, through a dynamic import, so a production build does not contain it.
 * It mounts the Tags sheet and the editor's keys (useShortcuts) with no map, and exposes what the check reads:
 * `window.__sheet` (the tags, every onChangeTags call, the undo and redo calls) and `window.__maid` (engine, editor).
 * `window.__bench` is a stub with the two methods runCheck waits for; the harness has no map to settle.
 */
import type { CombinedTags } from '@osm-editor-kit/maid-model'
import { TagSheet, TagViewButton, type TagSheetChange, type TagView } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { useEffect, useState } from 'react'
import { useShell } from './shell-context'
import { useShortcuts } from './useShortcuts'

type Tags = Record<string, string>

const FIXTURE: Tags = {
  highway: 'residential',
  name: 'A',
  surface: 'asphalt',
  lit: 'yes',
  maxspeed: '50',
}

const probe: {
  tags: Tags
  calls: { tags: Tags; label: string }[]
  undo: number
  redo: number
} = { tags: FIXTURE, calls: [], undo: 0, redo: 0 }

/** Several features: `name` differs, `surface` is missing on one of them, `highway` and `building` are shared. */
const COMBINED: CombinedTags = {
  highway: { kind: 'one', value: 'residential' },
  name: { kind: 'mixed', values: ['A', 'B'], missing: false },
  surface: { kind: 'mixed', values: ['asphalt'], missing: true },
  building: { kind: 'one', value: 'yes' },
}

const several: {
  calls: { change: TagSheetChange; label: string }[]
  undo: number
  redo: number
} = { calls: [], undo: 0, redo: 0 }

Object.assign(window, {
  __sheet: probe,
  __sheetSeveral: several,
  __bench: { ready: () => Promise.resolve(), settled: () => Promise.resolve() },
})

const SEVERAL = new URLSearchParams(location.search).has('several')
/** `?harness=tags&sides=1`: a road with its sides (as Torgauer Straße), and the switch of the view above the sheet */
const SIDES = new URLSearchParams(location.search).has('sides')

const SIDES_FIXTURE: Tags = {
  highway: 'residential',
  name: 'Torgauer Straße',
  'cycleway:both': 'lane',
  'cycleway:both:lane': 'advisory',
  'cycleway:both:width': '1.5',
  'source:cycleway:both:width': 'Luftbild 2025',
  'cycleway:left:oneway': '-1',
  'cycleway:right:oneway': 'yes',
  'parking:both': 'no',
  'sidewalk:both': 'separate',
  surface: 'asphalt',
}

function Shortcuts() {
  useShortcuts()
  return null
}

function Harness() {
  const [tags, setTags] = useState<Tags>(() => {
    probe.tags = SIDES ? SIDES_FIXTURE : FIXTURE
    return probe.tags
  })
  const [view, setView] = useState<TagView>('exact')
  return (
    <div className="mx-auto mt-8 w-[300px] px-4 text-zinc-950 dark:text-white">
      {SIDES && (
        <div className="flex justify-end">
          <TagViewButton view={view} onChange={setView} />
        </div>
      )}
      <TagSheet
        view={view}
        label="Tags of the feature"
        tags={tags}
        featureKey="harness"
        onChangeTags={(next, label) => {
          probe.tags = next
          probe.calls.push({ tags: next, label })
          setTags(next)
        }}
        onUndo={() => {
          probe.undo += 1
        }}
        onRedo={() => {
          probe.redo += 1
        }}
      />
      {/* only on request (?harness=tags&several=1): its cells have the same labels as the first sheet's */}
      {SEVERAL && (
        <TagSheet
          label="Tags of several"
          combined={COMBINED}
          featureKey="harness-several"
          onChange={(change, label) => {
            several.calls.push({ change, label })
          }}
          onUndo={() => {
            several.undo += 1
          }}
          onRedo={() => {
            several.redo += 1
          }}
        />
      )}
    </div>
  )
}

export function TagHarness() {
  const { engine, editor } = useShell()
  useEffect(() => {
    Object.assign(window, { __maid: { engine, editor } })
  }, [engine, editor])
  return (
    <NuqsAdapter>
      <Shortcuts />
      <Harness />
    </NuqsAdapter>
  )
}
