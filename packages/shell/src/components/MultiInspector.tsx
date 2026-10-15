import { XMarkIcon } from '@heroicons/react/20/solid'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { CombinedTags } from '@osm-editor-kit/maid-model'
import type { Field } from '@osm-editor-kit/maid-presets'
import type { EntityInfo, MaidEngine } from '@osm-editor-kit/maid-renderer'
import {
  InspectorSections,
  notify,
  PresetFields,
  Sidebar,
  SidebarBody,
  SidebarDisclosure,
  SidebarHeader,
  tagChangeOf,
  TagSheet,
  type TagSheetChange,
  type TagSuggestSource,
} from '@osm-editor-kit/maid-ui'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import {
  changesPerFeature,
  listedIds,
  refusalMessage,
  sharedFields,
  sharedTags,
  withoutId,
} from './multi-logic'
import { MultiIssues } from './MultiIssues'
import { MultiType } from './MultiType'
import { Operations } from './Operations'

const GEOMETRY_LABEL = {
  point: 'Point',
  vertex: 'Vertex',
  line: 'Line',
  area: 'Area',
  relation: 'Relation',
} as const

/** The types shown as icons on the type line; the rest are counted in the label (iD shows a few). */

/** What the inspector derives from the selection; computed once per selection and data version. */
type Derived = {
  ids: string[]
  names: string[]
  kinds: (string | undefined)[]
  combined: CombinedTags
  shared: Record<string, string>
  fields: Field[]
  /** Each selected feature with its tags: what a rename needs to keep each feature's own value. */
  features: { id: string; tags: Record<string, string> }[]
  /** The selected entities, for the module sections that work on several */
  entities: EntityInfo[]
  featureTags: Record<string, string>[]
  readOnly: number
}

/**
 * Read from the engine, once per selection and data version: `useEngine` passes the version, which
 * is what lets the React Compiler see that the engine's answers changed (a `useMemo` with the
 * version only in its dependency list is compiled away and stays at its first answer).
 */
function derive(engine: MaidEngine, editor: Editor, selectionKey: string): Derived {
  const list = selectionKey.split(',')
  const found = list.flatMap((id) => {
    const entity = engine.entity(id)
    return entity ? [{ id, entity }] : []
  })
  const presets = editor.presets
  // a field list depends on the preset and the geometry: one per pair, not one per feature
  const cache = new Map<string, Field[]>()
  const perFeature = found.map(({ entity }) => {
    if (!entity.preset || !presets) return []
    const key = `${entity.preset.id}|${entity.geometry}`
    let list = cache.get(key)
    if (!list) {
      list = presets.fieldsFor(entity.preset, entity.tags, entity.geometry, undefined)
      cache.set(key, list)
    }
    return list
  })
  const combined = engine.combinedTagsOf(found.map((f) => f.id))
  return {
    ids: found.map((f) => f.id),
    names: found.map(
      (f) => f.entity.tags.name ?? f.entity.preset?.name ?? GEOMETRY_LABEL[f.entity.geometry],
    ),
    kinds: found.map((f) => f.entity.preset?.name),
    combined,
    shared: sharedTags(combined),
    fields: sharedFields(perFeature),
    features: found.map((f) => ({ id: f.id, tags: f.entity.tags })),
    entities: found.map((f) => f.entity),
    featureTags: found.map((f) => f.entity.tags),
    readOnly: found.filter((f) => f.entity.readOnly).length,
  }
}

/**
 * The sidebar for several selected features, as iD's entity editor does for several: a header with the
 * count, the selection list, the type, the fields and the tags that the features share, and the edit
 * bar. A change goes to all of them in one undo step through `engine.changeTags`; a read-only feature
 * among them refuses the whole change with a toast. Not here yet: the feature type change, the shared
 * issues and the relation membership (docs/research/multi-selection.md, 3.1).
 */
export function MultiInspector({
  ids,
  suggest,
}: {
  ids: readonly string[]
  suggest?: TagSuggestSource
}) {
  const { editor, engine } = useShell()
  const { select } = useSelection()
  const selectionKey = ids.join(',')
  const derived = useEngine((e) => derive(e, editor, selectionKey))

  // one write to every selected feature, in one undo step; a refusal says why, and nothing changes. A rename
  // needs each feature's own value, so it goes as one change per feature (changeTagsEach).
  const write = (change: TagSheetChange, label?: string) => {
    const result =
      change.rename === undefined
        ? engine.changeTags(derived.ids, { set: change.set, remove: change.remove }, label)
        : engine.changeTagsEach(changesPerFeature(change, derived.features), label)
    if (result.ok) return
    notify.failed(refusalMessage(result))
  }

  const { shown, more } = listedIds(derived.ids)
  const count = derived.ids.length

  return (
    <Sidebar label="Selected features">
      <SidebarHeader title={`${count} features`} onClose={() => select(null)} />
      <SidebarBody>
        {derived.readOnly > 0 && (
          <p className="mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
            {derived.readOnly} of {count} selected features are read-only: a change is refused for
            all of them. Change the filters under “Filters” in the top bar.
          </p>
        )}
        <Operations />
        <div className="[&>*:first-child]:border-t [&>*:first-child]:pt-2.5">
          <SidebarDisclosure title="Features" detail={count} defaultOpen={count <= 10}>
            <ul className="flex flex-col gap-0.5" aria-label="Selected features">
              {shown.map((id) => {
                const index = derived.ids.indexOf(id)
                const name = derived.names[index] ?? id
                return (
                  <li key={id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-950/5 dark:hover:bg-white/10"
                      onClick={() => select([id])}
                      title={`Select only ${name}`}
                    >
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {derived.kinds[index] ?? ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-zinc-500 hover:bg-zinc-950/5 dark:text-zinc-400 dark:hover:bg-white/10"
                      aria-label={`Take ${name} out of the selection`}
                      onClick={() => select(withoutId(derived.ids, id))}
                    >
                      <XMarkIcon className="size-4" />
                    </button>
                  </li>
                )
              })}
              {more > 0 && <li className="px-2 py-1 text-xs text-zinc-500">and {more} more</li>}
            </ul>
          </SidebarDisclosure>
          <div className="py-2 text-sm">
            <MultiType ids={derived.ids} />
          </div>
          <MultiIssues ids={derived.ids} />
          {derived.entities[0] && (
            // module sections that declare `multiple` (the parking buttons) and fit every selected feature
            <InspectorSections
              placement="top"
              entity={derived.entities[0]}
              entities={derived.entities}
              editor={editor}
              select={select}
              readOnly={(id) => engine.isReadOnly(id)}
            />
          )}
          {derived.fields.length > 0 && (
            <SidebarDisclosure title="Fields" defaultOpen>
              <PresetFields
                // a new selection starts with no picked fields
                key={selectionKey}
                fields={derived.fields}
                tags={derived.shared}
                combined={derived.combined}
                features={derived.featureTags}
                onChange={(key, value) => write(tagChangeOf([{ key, value }]))}
                onChangeTags={(edits) => write(tagChangeOf(edits))}
              />
            </SidebarDisclosure>
          )}
          <SidebarDisclosure title="Tags" detail={Object.keys(derived.combined).length} defaultOpen>
            <TagSheet
              label="Tags"
              combined={derived.combined}
              featureKey={selectionKey}
              onChange={write}
              suggest={suggest}
              onUndo={() => engine.undo()}
              onRedo={() => engine.redo()}
            />
          </SidebarDisclosure>
          {derived.entities[0] && (
            <InspectorSections
              entity={derived.entities[0]}
              entities={derived.entities}
              editor={editor}
              select={select}
              readOnly={(id) => engine.isReadOnly(id)}
            />
          )}
        </div>
      </SidebarBody>
    </Sidebar>
  )
}
