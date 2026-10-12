import {
  InspectorSections,
  Sidebar,
  SidebarBody,
  SidebarEmpty,
  SidebarHeader,
  SidebarSection,
} from '@osm-editor-kit/maid-ui'
import { editor, engine, useEngine } from '../editor'
import { useSelectedId } from '../url/state'
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
  const [id, setId] = useSelectedId()
  // read again when data arrives: a selection from the URL exists before its feature is loaded
  const entity = useEngine((e) => e.entity(id))

  if (!id) {
    return (
      <Sidebar label="Inspector">
        <SidebarEmpty title="Nothing selected">
          Click a feature on the map to see and edit its tags.
        </SidebarEmpty>
      </Sidebar>
    )
  }

  const close = () => {
    engine.setSelected(null)
    void setId(null)
  }
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
          <SidebarSection title="Tags">
            <TagList
              tags={entity.tags}
              onChange={
                entity.type === 'relation'
                  ? undefined
                  : (key, value) => engine.setTag(id, key, value)
              }
            />
          </SidebarSection>
          <InspectorSections entity={entity} editor={editor} />
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Changes stay in this browser tab. Saving to OSM is not built yet.
          </p>
        </SidebarBody>
      )}
    </Sidebar>
  )
}
