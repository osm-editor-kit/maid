import {
  InspectorSections,
  PresetFields,
  PresetPicker,
  Sidebar,
  SidebarBody,
  SidebarEmpty,
  SidebarHeader,
  SidebarSection,
} from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { editor, engine, useEngine } from '../editor'
import { useSelection } from '../selection'
import { Operations } from './Operations'
import { PresetIcon } from './PresetIcon'
import { TagList } from './TagList'

const GEOMETRY_LABEL = {
  point: 'Point',
  vertex: 'Vertex',
  line: 'Line',
  area: 'Area',
  relation: 'Relation',
}

/** The sidebar: what the selected feature is (iD preset), its tags and the sections of modules. */
export function Inspector() {
  const { id, ids, select } = useSelection()
  // read again when data arrives: a selection from the URL exists before its feature is loaded
  const entity = useEngine((e) => e.entity(id))
  // the id the picker was opened for: selecting something else closes it
  const [pickingFor, setPickingFor] = useState<string | null>(null)

  if (!id) {
    return (
      <Sidebar label="Inspector">
        <SidebarEmpty title="Nothing selected">
          Click a feature on the map to see and edit its tags.
        </SidebarEmpty>
      </Sidebar>
    )
  }

  const close = () => select(null)

  if (ids.length > 1) {
    return (
      <Sidebar label="Selected features">
        <SidebarHeader
          title={`${ids.length} features selected`}
          subtitle={ids.join(', ')}
          onClose={close}
        />
        <SidebarBody>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Shift-click adds a feature to the selection or takes it out.
          </p>
          <Operations />
        </SidebarBody>
      </Sidebar>
    )
  }
  const onChange = entity
    ? (key: string, value: string | undefined) => engine.setTag(id, key, value)
    : undefined
  const { presets } = editor
  const fields =
    entity?.preset && presets ? presets.fieldsFor(entity.preset, entity.tags, entity.geometry) : []
  // a feature that was just added (negative id) and has no type yet asks for it right away
  const untagged =
    entity !== undefined &&
    id.includes('-') &&
    (!entity.preset || Object.keys(entity.preset.tags).length === 0)
  const picking = onChange !== undefined && (pickingFor === id || untagged)
  const kind = entity ? (entity.preset?.name ?? GEOMETRY_LABEL[entity.geometry]) : undefined

  return (
    <Sidebar label="Selected feature">
      <SidebarHeader
        icon={
          <PresetIcon
            icon={entity?.preset?.icon}
            className="size-8 fill-zinc-700 dark:fill-zinc-200"
          />
        }
        title={entity ? (entity.tags.name ?? entity.preset?.name ?? 'Feature') : 'Loading…'}
        subtitle={kind ? `${kind} · ${id}` : id}
        onClose={close}
      />
      {entity && (
        <SidebarBody>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            {GEOMETRY_LABEL[entity.geometry]}
            {entity.type === 'way' && `, ${entity.size} nodes`}
            {entity.type === 'relation' && `, ${entity.size} members`}
          </p>
          {picking && presets ? (
            <SidebarSection title="Feature type">
              <PresetPicker
                autoFocus
                currentId={entity.preset?.id}
                search={(query) => presets.search(query, entity.geometry)}
                renderIcon={(preset) => (
                  <PresetIcon icon={preset.icon} className="fill-zinc-700 dark:fill-zinc-200" />
                )}
                onPick={(preset) => {
                  const tags = presets.applyPreset(
                    entity.tags,
                    preset,
                    entity.geometry,
                    entity.preset,
                  )
                  engine.setTags(id, tags, `Changed the feature type to ${preset.name}`)
                  setPickingFor(null)
                }}
              />
            </SidebarSection>
          ) : (
            onChange &&
            presets && (
              <button
                type="button"
                onClick={() => setPickingFor(id)}
                className="mb-3 cursor-pointer text-xs text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400"
              >
                Change feature type
              </button>
            )
          )}
          <Operations />
          {fields.length > 0 && (
            <SidebarSection title="Fields">
              <PresetFields fields={fields} tags={entity.tags} onChange={onChange} />
            </SidebarSection>
          )}
          <SidebarSection title="Tags">
            <TagList tags={entity.tags} onChange={onChange} />
          </SidebarSection>
          <InspectorSections entity={entity} editor={editor} select={select} />
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Changes stay in this browser tab. Saving to OSM is not built yet.
          </p>
        </SidebarBody>
      )}
    </Sidebar>
  )
}
