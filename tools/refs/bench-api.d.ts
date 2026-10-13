/**
 * The contract every editor host page implements as `window.__bench`.
 * The benchmark and the compare page only talk to editors through this.
 *
 * Zoom is the OSM/iD zoom (256px tiles). MapLibre's zoom is one less for the same scale.
 * Ids are OSM ids with a type prefix: n1, w2, r3.
 */
export type BenchCamera = { lng: number; lat: number; zoom: number }

export type BenchStats = {
  /** Entities the editor holds in memory */
  entities: { nodes: number; ways: number; relations: number }
  /** What is on screen right now, in the editor's own terms (DOM elements, display objects, rendered features) */
  drawn: Record<string, number>
  /** Features the editor chose not to draw (iD auto-hides when there are too many). Empty if none. */
  hidden: Record<string, number>
}

export type BenchApi = {
  editor: 'maid' | 'id' | 'rapid'
  version: string
  /** Resolves when the editor is initialised and the camera can be set */
  ready(): Promise<void>
  /** Jump, no animation */
  setCamera(camera: BenchCamera): void
  getCamera(): BenchCamera
  /** Screen position in CSS pixels relative to the viewport, for real pointer events */
  project(lng: number, lat: number): { x: number; y: number }
  /**
   * Resolves when the picture is final for the current camera: all data for the view is
   * loaded and merged, a full redraw with that data has been painted, nothing is queued.
   * Must not resolve early while a throttled redraw is still pending.
   * Everything the editor loads by itself after start is in as well (Maid: its lazy chunks, see `drawn`).
   */
  settled(): Promise<void>
  /**
   * Resolves when the map shows the complete data for the view: the same wait as `settled`, without the work that
   * comes after the first picture (Maid: its lazy chunks). iD and Rapid have no such work, so for them it is `settled`.
   */
  drawn(): Promise<void>
  /**
   * The visible map area in viewport CSS pixels: the editor's map element, without the sidebar, the bars and the
   * panels around it. The benchmark picks what it points at inside this rectangle.
   */
  mapRect(): { left: number; top: number; width: number; height: number }
  stats(): BenchStats
  /** Select through the editor's own selection path. null clears. Resolves when the selection is drawn. */
  select(id: string | null): Promise<void>
  selected(): string[]
  /** Ids the editor currently shows as hovered */
  hovered(): string[]
  /**
   * Current position of a node in the editor's data, as [lng, lat]. Lets the benchmark check
   * that a real mouse drag on a vertex moved it. undefined if the node is not loaded.
   */
  nodeLoc(id: string): [number, number] | undefined
  /**
   * Every draw of the map. `seq` rises by one for each draw that ended, `at` is performance.now() when the latest one
   * ended. The edit benchmark times an input or a call by the first draw after it: iD's `drawn` event, Rapid's `draw`
   * (GraphicsSystem), MapLibre's `render` (Maid). Counted, not waited for: nothing here changes the picture.
   */
  paint(): BenchPaint
  /**
   * Sets one tag through the editor's own edit path, as one undo step (iD: context.perform with actionChangeTags,
   * Rapid: EditSystem.perform + commit, Maid: MaidEngine.setTag). Synchronous: the data has changed when it returns,
   * the picture follows (see `paint`). Nothing happens when the value is already there.
   */
  setTag(id: string, key: string, value: string | undefined): void
  /** The editor's own undo and redo (its toolbar and shortcut). Synchronous as for `setTag`. */
  undo(): void
  redo(): void
  /**
   * Whether the inspector is rendered for this feature: the feature is selected and the editor's sidebar holds its
   * editor. The DOM counts, not the pixels: iD and Rapid start with the sidebar collapsed (see their adapters).
   */
  inspectorShows(id: string): boolean
  /** Maid only: the lens on the map, by id, or null for the default look. The other editors have no lenses. */
  setLens?(id: string | null): void
}

export type BenchPaint = { seq: number; at: number }

declare global {
  interface Window {
    __bench: BenchApi
  }
}
