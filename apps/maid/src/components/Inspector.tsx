import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import {
  InspectorSections,
  PresetFields,
  PresetPicker,
  Sidebar,
  SidebarBody,
  SidebarEmpty,
  SidebarHeader,
  SidebarDisclosure,
} from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { editor, engine, useEngine } from '../editor'
import {
  changeType,
  moveFavourite,
  toggleFavourite,
  useFavouriteRows,
  useFavouritesFull,
} from '../favourites'
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
  const moduleFields = useExtensionPoint(editor, 'inspector.field')
  const fieldTypes = Object.fromEntries(moduleFields.map((item) => [item.type, item.component]))
  // the favourites of the feature's geometry, for the type picker
  const favourites = useFavouriteRows(entity?.geometry)
  const favouritesFull = useFavouritesFull()
  // whether the type picker is open, and for which id: selecting something else forgets it
  const [picker, setPicker] = useState<{ id: string; open: boolean } | null>(null)

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
  // a filter can make a feature read-only: it is shown, its fields and tags cannot be changed
  const onChange =
    entity && !entity.readOnly
      ? (key: string, value: string | undefined) => engine.setTag(id, key, value)
      : undefined
  const { presets } = editor
  const fields =
    entity?.preset && presets ? presets.fieldsFor(entity.preset, entity.tags, entity.geometry) : []
  // what "Add field" offers; a read-only feature gets no list
  const moreFields =
    onChange && entity?.preset && presets
      ? presets.moreFieldsFor(entity.preset, entity.tags, entity.geometry)
      : []
  // a feature that was just added (negative id) and has no type yet asks for it right away
  const untagged =
    entity !== undefined &&
    id.includes('-') &&
    (!entity.preset || Object.keys(entity.preset.tags).length === 0)
  const picking = onChange !== undefined && (picker?.id === id ? picker.open : untagged)
  const kind = entity ? (entity.preset?.name ?? GEOMETRY_LABEL[entity.geometry]) : undefined

  // under the name: what kind of thing it is. Id and node count are in the "Element" group.
  const title = entity ? (entity.tags.name ?? kind ?? 'Feature') : 'Loading…'
  const details = entity && kind !== title ? kind : entity ? GEOMETRY_LABEL[entity.geometry] : id
  const canChangeType = onChange !== undefined && presets !== undefined

  return (
    <Sidebar label="Selected feature">
      <SidebarHeader
        icon={
          <PresetIcon icon={entity?.preset?.icon} className="fill-zinc-700 dark:fill-zinc-200" />
        }
        title={title}
        subtitle={details}
        // as in iD, the feature's head is the button that changes its type
        onTitleClick={canChangeType ? () => setPicker({ id, open: !picking }) : undefined}
        expanded={picking}
        titleAction="Change the feature type"
        // in a flyout that points at the head, so the fields below stay where they are
        titleFlyout={
          entity && presets ? (
            <div className="p-3">
              <PresetPicker
                autoFocus
                currentId={entity.preset?.id}
                search={(query) => presets.search(query, entity.geometry)}
                renderIcon={(preset) => (
                  <PresetIcon icon={preset.icon} className="fill-zinc-700 dark:fill-zinc-200" />
                )}
                favourites={favourites}
                favouritesFull={favouritesFull}
                onToggleFavourite={(preset) => toggleFavourite(preset, entity.geometry)}
                onMoveFavourite={(preset, delta) => moveFavourite(preset, entity.geometry, delta)}
                onPick={(preset) => {
                  changeType(id, preset)
                  setPicker({ id, open: false })
                }}
              />
            </div>
          ) : undefined
        }
      />
      {entity && (
        <SidebarBody>
          {entity.readOnly ? (
            <p className="mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
              Read-only: a filter protects this feature. Change it under “Filters” in the top bar.
            </p>
          ) : (
            <Operations />
          )}
          {/* their own box, so the first group has no line above it: the edit bar has one below */}
          <div>
            {(fields.length > 0 || moreFields.length > 0) && (
              <SidebarDisclosure title="Fields" defaultOpen>
                <PresetFields
                  // picked fields belong to the feature: a new feature starts with none
                  key={id}
                  fields={fields}
                  moreFields={moreFields}
                  tags={entity.tags}
                  // what "revert" goes back to; a feature that was added here has nothing to revert to
                  baseTags={engine.baseTags(id)}
                  onChange={onChange}
                />
              </SidebarDisclosure>
            )}
            <SidebarDisclosure title="Tags" detail={Object.keys(entity.tags).length} defaultOpen>
              <TagList tags={entity.tags} onChange={onChange} />
            </SidebarDisclosure>
            <InspectorSections entity={entity} editor={editor} select={select} />
          </div>
        </SidebarBody>
      )}
    </Sidebar>
  )
}
