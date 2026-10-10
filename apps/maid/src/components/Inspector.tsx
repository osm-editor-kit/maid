import { useSyncExternalStore } from 'react'
import { engine } from '../editor'
import { useSelectedId } from '../url'
import { PresetIcon } from './PresetIcon'
import { TagList } from './TagList'

const GEOMETRY_LABEL = { point: 'Point', vertex: 'Vertex', line: 'Line', area: 'Area', relation: 'Relation' }

/** Sidebar for the selected feature: what it is (iD preset) and its tags. Floats over the map. */
export function Inspector() {
  const [id, setId] = useSelectedId()
  // re-read when data arrives: a selection from the URL exists before its feature is loaded
  useSyncExternalStore(engine.subscribe, engine.getVersion)
  if (!id) return null
  const entity = engine.entity(id)

  const close = () => {
    engine.setSelected(null)
    void setId(null)
  }

  return (
    <aside
      aria-label="Selected feature"
      className="absolute top-2 bottom-10 left-2 flex w-80 flex-col overflow-hidden rounded-md bg-white shadow-lg"
    >
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-100 p-3">
        <PresetIcon icon={entity?.preset?.icon} className="size-8 shrink-0 fill-neutral-700" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {entity ? (entity.tags.name ?? entity.preset?.name ?? 'Feature') : 'Loading…'}
          </h2>
          <p className="truncate text-xs text-neutral-600">
            {entity ? `${entity.preset?.name ?? GEOMETRY_LABEL[entity.geometry]} · ${id}` : id}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="rounded px-2 py-1 text-lg leading-none text-neutral-600 hover:bg-neutral-200"
        >
          ×
        </button>
      </header>
      {entity && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs text-neutral-500">
            {GEOMETRY_LABEL[entity.geometry]}
            {entity.type === 'way' && `, ${entity.size} nodes`}
            {entity.type === 'relation' && `, ${entity.size} members`}
          </p>
          <TagList
            tags={entity.tags}
            onChange={entity.type === 'relation' ? undefined : (key, value) => engine.setTag(id, key, value)}
          />
          <p className="mt-3 text-xs text-neutral-500">Changes stay in this browser tab. Saving to OSM is not built yet.</p>
        </div>
      )}
    </aside>
  )
}
