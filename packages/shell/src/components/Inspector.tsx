import { StarIcon as StarSolidIcon } from '@heroicons/react/16/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import {
  createTaginfo,
  isAutomated,
  moduleStorage,
  type Editor,
  type TaginfoGeometry,
} from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { m } from '@osm-editor-kit/maid-i18n'
import { browseOf, type Geometry, type Preset } from '@osm-editor-kit/maid-presets'
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
  CopyTagsButton,
} from '@osm-editor-kit/maid-ui'
import { useEffect, useMemo, useState } from 'react'
import { changeType, moveFavourite, toggleFavourite, useFavouriteEntries } from '../favourites'
import { imageryOnMap } from '../imagery-used'
import { useOpenRelationId } from '../modules/relations-open-store'
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
 * The icon of a combo value (the schema's `icons`, fields/Combo.tsx), from the same sprites as the preset icons.
 * Module-level, so its identity is stable for PresetFields.
 */
function renderFieldIcon(icon: string) {
  return <PresetIcon icon={icon} className="size-5 fill-current" />
}

/**
 * The map shows the field that has the focus or the pointer on it, on the selected way: a side line
 * or a width band (field-overlay.ts). Module-level, so its identity is stable for PresetFields.
 */
function showFieldFocus(engine: MaidEngine, focus: FieldFocus | null) {
  const id = engine.selection[0]
  engine.setFieldOverlay(fieldOverlayFor(focus, id ? engine.entity(id)?.tags : undefined))
}

/**
 * The star of the feature's type, as the picker's star: filled when the type is a favourite for the feature's
 * geometry. A click makes it a favourite or takes it out again, in the same store the picker uses.
 */
function FavouriteStar(props: { preset: Preset; geometry: Geometry; on: boolean }) {
  const { preset, geometry, on } = props
  const label = on
    ? m.favourite_remove({ name: preset.name })
    : m.favourite_add({ name: preset.name })
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => toggleFavourite(preset, geometry)}
      className={`relative grid size-5 shrink-0 cursor-pointer place-items-center rounded-full after:absolute after:-inset-1.5 after:content-[''] hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10 ${on ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
    >
      {on ? (
        <StarSolidIcon aria-hidden="true" className="size-4" />
      ) : (
        <StarOutlineIcon aria-hidden="true" className="size-4" />
      )}
    </button>
  )
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
  // the relation open beside the inspector: its members section hides then (see `refresh` on the sections below)
  const openRelation = useOpenRelationId()
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
      ? { country: presets.countryCodesAt(loc), candidates: engine.nearby(id) }
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

  // the name, and under it the kind of thing when the feature has a name. Without a name the kind is the
  // title and nothing is under it. Id and node count are in the "Element" group.
  const title = entity ? (entity.tags.name ?? kind ?? 'Feature') : 'Loading…'
  const hasName = entity?.tags.name !== undefined
  const details = entity ? (hasName && kind !== title ? kind : undefined) : id
  const canChangeType = onChange !== undefined && presets !== undefined
  // the controls at the right of the head: the wiki's page for the type, and the star that makes the
  // type a favourite for the geometry (not for a fallback type, which is no type at all)
  const reference = entity?.preset?.reference
  // a relation cannot be drawn, so its type is never a favourite: no star
  const starred =
    entity &&
    entity.preset &&
    presets &&
    !presets.isFallback(entity.preset) &&
    entity.geometry !== 'relation'
      ? { preset: entity.preset, geometry: entity.geometry }
      : undefined
  const isFavourite =
    starred !== undefined &&
    favourites.some(
      (item) => item.preset.id === starred.preset.id && item.geometry === starred.geometry,
    )
  const headMeta =
    reference || starred ? (
      <>
        {reference ? (
          <InfoPopover
            label={kind ?? 'feature type'}
            reference={reference}
            load={loadReference}
            // a small "i", as beside a field's title; its hit area reaches 32 px, as the star's
            buttonClassName="relative after:absolute after:-inset-1.5 after:content-['']"
          />
        ) : null}
        {starred ? (
          <FavouriteStar preset={starred.preset} geometry={starred.geometry} on={isFavourite} />
        ) : null}
      </>
    ) : undefined

  return (
    <WikiContext value={wiki}>
      <Sidebar label="Selected feature">
        <SidebarHeader
          icon={
            <PresetIcon icon={entity?.preset?.icon} className="fill-zinc-700 dark:fill-zinc-200" />
          }
          title={title}
          subtitle={details}
          // at the right of the head, over it and not inside it
          meta={headMeta}
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
                  // a generic type (a new, untagged feature) is no type to keep: the picker stays at its top, on
                  // the recently used types, instead of scrolling down to "Area" or "Line"
                  currentId={
                    entity.preset && !presets.isFallback(entity.preset)
                      ? entity.preset.id
                      : undefined
                  }
                  search={(query) => presets.search(query, entity.geometry, undefined, loc)}
                  browse={browseOf(presets, [entity.geometry], loc)}
                  texts={pickerTexts()}
                  renderIcon={(preset) => (
                    <PresetIcon icon={preset.icon} className="fill-zinc-700 dark:fill-zinc-200" />
                  )}
                  favourites={favourites}
                  geometry={entity.geometry}
                  // a relation is no favourite: the picker gets no star and no move buttons for it
                  onToggleFavourite={entity.geometry === 'relation' ? undefined : toggleFavourite}
                  onMoveFavourite={entity.geometry === 'relation' ? undefined : moveFavourite}
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
                {engine.isOffLevel(entity.id)
                  ? 'Read-only: this feature is on another level. Choose its level in the level picker on the map.'
                  : 'Read-only: a filter protects this feature. Change it under “Filters” in the top bar.'}
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
                    // the icons of the combo values (the schema's `icons`)
                    renderIcon={renderFieldIcon}
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
              <SidebarDisclosure
                title="Tags"
                detail={Object.keys(entity.tags).length}
                defaultOpen
                actions={<CopyTagsButton tags={entity.tags} />}
              >
                <TagSheet
                  copyButton={false}
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
                // the members section's `when` reads the open relation: it is asked again when that changes
                refresh={openRelation}
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
