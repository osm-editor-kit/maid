import {
  createTaginfo,
  isAutomated,
  moduleStorage,
  type Editor,
  type TaginfoGeometry,
} from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { m } from '@osm-editor-kit/maid-i18n'
import { browseOf } from '@osm-editor-kit/maid-presets'
import type { EntityInfo, MaidEngine } from '@osm-editor-kit/maid-renderer'
import {
  type FieldFocus,
  InfoPopover,
  InspectorSections,
  PresetFields,
  PresetPicker,
  Sidebar,
  SidebarBody,
  SidebarEmpty,
  SidebarHeader,
  SidebarDisclosure,
  tagChangeOf,
  TagSheet,
  type TagSuggestSource,
  WikiContext,
  createWikiSource,
} from '@osm-editor-kit/maid-ui'
import { useEffect, useMemo, useState } from 'react'
import { changeType, moveFavourite, toggleFavourite, useFavouriteEntries } from '../favourites'
import { imageryOnMap } from '../imagery-used'
import { useIssuesVersion } from '../modules/validation'
import { useNewFeatureId } from '../new-feature'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { pickerTexts } from './favourite-texts'
import { fieldOverlayFor, widthKeyTarget } from './field-overlay'
import { measureTags } from './measure-tags'
import { MultiInspector } from './MultiInspector'
import { Operations } from './Operations'
import { PresetIcon } from './PresetIcon'
import { createReferenceLoader } from './reference'

const GEOMETRY_LABEL = {
  point: 'Point',
  vertex: 'Vertex',
  line: 'Line',
  area: 'Area',
  relation: 'Relation',
}

/**
 * The taginfo suggestions of the tags sheet, one source per geometry, as iD's taginfo.js: one client on the
 * editor's fetch and query cache. The Inspector keeps them in a memo, so that the sheet gets the same objects.
 */
function tagSuggestSourcesOf(editor: Editor): Record<TaginfoGeometry, TagSuggestSource> {
  const taginfo = createTaginfo({ fetch: editor.fetch, queries: editor.queries })
  const sourceOf = (kind: TaginfoGeometry): TagSuggestSource => ({
    keys: (query, signal) => taginfo.keys(query, kind, signal),
    values: (key, query, signal) => taginfo.values(key, query, kind, signal),
  })
  return {
    point: sourceOf('point'),
    vertex: sourceOf('vertex'),
    line: sourceOf('line'),
    area: sourceOf('area'),
    relation: sourceOf('relation'),
  }
}

/** The OSM Wiki's answers for the "i" buttons: one loader per editor, on its fetch and query cache */
const referenceLoaders = new WeakMap<Editor, ReturnType<typeof createReferenceLoader>>()
function referenceLoaderFor(editor: Editor) {
  let loader = referenceLoaders.get(editor)
  if (!loader) {
    loader = createReferenceLoader({
      fetch: editor.fetch,
      queries: editor.queries,
      storage: moduleStorage(),
      now: () => Date.now(),
    })
    referenceLoaders.set(editor, loader)
  }
  return loader
}

/**
 * The map shows the field that has the focus or the pointer on it, on the selected way: a side line
 * or a width band (field-overlay.ts). Module-level, so its identity is stable for PresetFields.
 */
function showFieldFocus(engine: MaidEngine, focus: FieldFocus | null) {
  const id = engine.selection[0]
  engine.setFieldOverlay(fieldOverlayFor(focus, id ? engine.entity(id)?.tags : undefined))
}

/** The sidebar: what the selected feature is (iD preset), its tags and the sections of modules. */
export function Inspector() {
  const { editor, engine } = useShell()
  const loadReference = referenceLoaderFor(editor)
  // The Wikipedia and Wikidata lookups of the two fields: none under automation, so that the fields are plain text
  // inputs there (AGENTS.md, core rule 1). The taginfo sources, one per geometry, for the tags sheet.
  const wiki = useMemo(
    () => (isAutomated() ? undefined : createWikiSource({ fetch: editor.fetch })),
    [editor],
  )
  const suggestSources = useMemo(() => tagSuggestSourcesOf(editor), [editor])
  const { id, ids, select } = useSelection()
  // read again when data arrives: a selection from the URL exists before its feature is loaded
  const entity: EntityInfo | undefined = useEngine((e) => e.entity(id))
  // the issues of the selection are checked in idle time: the sections ask again when that check is done
  useIssuesVersion(editor)
  const newFeatureId = useNewFeatureId()
  const moduleFields = useExtensionPoint(editor, 'inspector.field')
  const fieldTypes = Object.fromEntries(moduleFields.map((item) => [item.type, item.component]))
  // the favourites, of every geometry, for the type picker
  const favourites = useFavouriteEntries()
  // whether the type picker is open, and for which id: selecting something else forgets it
  const [picker, setPicker] = useState<{ id: string; open: boolean } | null>(null)
  // the key whose width is being measured on the map: state here, not a module variable
  const [measureKey, setMeasureKey] = useState<string>()
  // a measure is about the features it began on: a change of the selection (or leaving the inspector) ends it
  const selectionKey = ids.join(',')
  useEffect(() => () => engine.cancelMeasure(), [selectionKey, engine])

  if (!id) {
    return (
      <Sidebar label="Inspector">
        <SidebarEmpty title={m.sidebar_empty_title()}>{m.sidebar_empty_hint()}</SidebarEmpty>
      </Sidebar>
    )
  }

  // several features: what they share, in MultiInspector (iD's entity editor for several)
  if (ids.length > 1) {
    return (
      <MultiInspector ids={ids} suggest={entity ? suggestSources[entity.geometry] : undefined} />
    )
  }
  // a filter can make a feature read-only: it is shown, its fields and tags cannot be changed
  const onChange =
    entity && !entity.readOnly
      ? (key: string, value: string | undefined) => engine.setTag(id, key, value)
      : undefined
  // several keys of one choice (a side that splits `both`, a field that is removed): one undo step
  const onChangeTags = onChange
    ? (edits: readonly { key: string; value: string | undefined }[]) =>
        engine.changeTags([id], tagChangeOf(edits))
    : undefined
  /**
   * The "Measure on the map" button of a width field: the first click on the map sets the start, the
   * second the end. The distance is written into the field, and the background imagery on the map is
   * written as its `source:<key>` (measure-tags.ts), both in one edit: one undo step. The button again,
   * or Escape, cancels and writes nothing.
   */
  const startMeasure = (key: string) => {
    const again = measureKey === key && engine.measuring
    engine.cancelMeasure()
    if (again) return
    setMeasureKey(key)
    engine.startMeasure((metres) => {
      setMeasureKey(undefined)
      if (metres === undefined || !onChange) return
      // the background when the measure ends is the one it was taken on
      const changes = measureTags(key, metres, imageryOnMap(editor).background)
      // a measure of no distance (two clicks in one place) writes nothing
      if (Object.keys(changes).length === 0) return
      // the feature's tags as they are now, with the changes: one edit, so one undo step
      engine.setTags(id, { ...engine.entity(id)?.tags, ...changes }, 'Measured width')
    })
  }
  const { presets } = editor
  // the place of the feature (the centre of its extent): fields with a location set are looked up there
  const loc = entity ? engine.centreOf(id) : undefined
  const fields =
    entity?.preset && presets
      ? presets.fieldsFor(entity.preset, entity.tags, entity.geometry, loc)
      : []
  // what "Add field" offers; a read-only feature gets no list
  const moreFields =
    onChange && entity?.preset && presets
      ? presets.moreFieldsFor(entity.preset, entity.tags, entity.geometry, loc)
      : []
  // the address field's country and the features near this one: found only when an address field is shown
  const address =
    presets && loc && [...fields, ...moreFields].some((field) => field.type === 'address')
      ? { country: presets.countryAt(loc), candidates: engine.nearby(id) }
      : undefined
  // a feature that was just added and has no type yet asks for it right away, as iD's inspector does for its new
  // feature. "No type yet" is a fallback preset (no tags, or only area=*), so a new area with area=yes asks too;
  // selecting it again later shows its fields
  const untagged =
    entity !== undefined &&
    newFeatureId === id &&
    (!entity.preset || (presets !== undefined && presets.isFallback(entity.preset)))
  const picking = onChange !== undefined && (picker?.id === id ? picker.open : untagged)
  const kind = entity ? (entity.preset?.name ?? GEOMETRY_LABEL[entity.geometry]) : undefined

  // under the name: what kind of thing it is. Id and node count are in the "Element" group.
  const title = entity ? (entity.tags.name ?? kind ?? 'Feature') : 'Loading…'
  const details = entity && kind !== title ? kind : entity ? GEOMETRY_LABEL[entity.geometry] : id
  const canChangeType = onChange !== undefined && presets !== undefined

  return (
    <WikiContext value={wiki}>
      <Sidebar label="Selected feature">
        <SidebarHeader
          icon={
            <PresetIcon icon={entity?.preset?.icon} className="fill-zinc-700 dark:fill-zinc-200" />
          }
          title={title}
          subtitle={details}
          // the wiki's page for the type, beside the head and not inside it
          info={
            entity?.preset?.reference ? (
              <InfoPopover
                label={kind ?? 'feature type'}
                reference={entity.preset.reference}
                load={loadReference}
                // the look of the swap button next to it
                buttonClassName="size-8 rounded-md inset-ring-1 inset-ring-zinc-950/10 dark:inset-ring-white/10"
              />
            ) : undefined
          }
          // as in iD, the feature's head is the button that changes its type
          onTitleClick={canChangeType ? () => setPicker({ id, open: !picking }) : undefined}
          expanded={picking}
          titleAction="Change the feature type"
          // in a flyout that points at the head, so the fields below stay where they are
          titleFlyout={
            entity && presets ? (
              <div className="p-3">
                <PresetPicker
                  // keyed by the feature: another feature's picker starts with no search, so its groups show
                  key={id}
                  autoFocus
                  currentId={entity.preset?.id}
                  search={(query) => presets.search(query, entity.geometry, undefined, loc)}
                  browse={browseOf(presets, [entity.geometry], loc)}
                  texts={pickerTexts()}
                  renderIcon={(preset) => (
                    <PresetIcon icon={preset.icon} className="fill-zinc-700 dark:fill-zinc-200" />
                  )}
                  favourites={favourites}
                  geometry={entity.geometry}
                  onToggleFavourite={toggleFavourite}
                  onMoveFavourite={moveFavourite}
                  onPick={(preset) => {
                    changeType({ editor, engine }, id, preset)
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
            {/* the groups in their own box; each has a line above it, the first one too, under the edit bar */}
            <div className="[&>*:first-child]:border-t [&>*:first-child]:pt-2.5">
              <InspectorSections
                placement="top"
                entity={entity}
                editor={editor}
                select={select}
                readOnly={(id) => engine.isReadOnly(id)}
                onFieldFocus={(focus) => showFieldFocus(engine, focus)}
              />
              {(fields.length > 0 || moreFields.length > 0) && (
                <SidebarDisclosure title="Fields" defaultOpen>
                  <PresetFields
                    // picked fields belong to the feature: a new feature starts with none
                    key={id}
                    fields={fields}
                    moreFields={moreFields}
                    tags={entity.tags}
                    address={address}
                    // what "revert" goes back to; a feature that was added here has nothing to revert to
                    baseTags={engine.baseTags(id)}
                    onChange={onChange}
                    onChangeTags={onChangeTags}
                    // field types that modules bring (`inspector.field`)
                    components={fieldTypes}
                    loadReference={loadReference}
                    onFieldFocus={(focus) => showFieldFocus(engine, focus)}
                    // a width field of a single way has the "Measure on the map" button
                    measure={{
                      can: (key) =>
                        onChange !== undefined &&
                        id.startsWith('w') &&
                        widthKeyTarget(key) !== undefined,
                      start: startMeasure,
                      active: measureKey,
                    }}
                  />
                </SidebarDisclosure>
              )}
              <SidebarDisclosure title="Tags" detail={Object.keys(entity.tags).length} defaultOpen>
                <TagSheet
                  label="Tags"
                  tags={entity.tags}
                  featureKey={id}
                  // a filter made the feature read-only: the sheet is shown, navigable and copyable, not edited
                  readOnly={entity.readOnly}
                  onChangeTags={(tags, label) => engine.setTags(id, tags, label)}
                  suggest={suggestSources[entity.geometry]}
                  onUndo={() => engine.undo()}
                  onRedo={() => engine.redo()}
                />
              </SidebarDisclosure>
              <InspectorSections
                entity={entity}
                editor={editor}
                select={select}
                readOnly={(id) => engine.isReadOnly(id)}
                onFieldFocus={(focus) => showFieldFocus(engine, focus)}
                onRelated={(ids) => engine.setRelated(ids)}
              />
            </div>
          </SidebarBody>
        )}
      </Sidebar>
    </WikiContext>
  )
}
