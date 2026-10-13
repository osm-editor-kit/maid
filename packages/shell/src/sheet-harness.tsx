/**
 * Dev-only harness for the browser check of the Tags sheet (tools/bench/tags-check.ts). main.tsx loads this module
 * only on the dev server, with `?harness=tags`, through a dynamic import, so a production build does not contain it.
 * It mounts the Tags sheet and the editor's keys (useShortcuts) with no map, and exposes what the check reads:
 * `window.__sheet` (the tags, every onChangeTags call, the undo and redo calls) and `window.__maid` (engine, editor).
 * `window.__bench` is a stub with the two methods runCheck waits for; the harness has no map to settle.
 */
import { TagSheet, type TagSheetProps } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { useEffect, useState } from 'react'
import { useShortcuts } from './components/useShortcuts'
import { useShell } from './shell-context'

type Tags = TagSheetProps['tags']

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

Object.assign(window, {
  __sheet: probe,
  __bench: { ready: () => Promise.resolve(), settled: () => Promise.resolve() },
})

function Shortcuts() {
  useShortcuts()
  return null
}

function Harness() {
  const [tags, setTags] = useState<Tags>(FIXTURE)
  return (
    <div className="mx-auto mt-8 w-[300px] px-4 text-zinc-950 dark:text-white">
      <TagSheet
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
