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
   */
  settled(): Promise<void>
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
}

declare global {
  interface Window {
    __bench: BenchApi
  }
}
