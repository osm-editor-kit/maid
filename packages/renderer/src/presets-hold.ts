/**
 * Presets that arrive after the first tiles: points and vertices wait for them a little (`hold`), and what
 * was drawn without an icon is built again once they are there (`fillIn`). Owned by the engine as
 * `presetsHold`. The engine's data, builder and sending are reached through `PresetsHost`.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { Presets } from '@osm-editor-kit/maid-presets'
import { hasInterestingTags } from '@osm-editor-kit/maid-style'
import type { FeatureBuilder, FeatureBatch, SourceName } from './build'
import type { OsmData } from './data'
import type { EngineMetrics } from './engine'
import { featureId } from './feature-id'

/** How long points and vertices wait for presets that are being made before they are drawn without icons */
const PRESETS_HOLD_MS = 300
/** After this, an engine that holds features starts the presets itself, if nobody has */
const PRESETS_START_MS = 100

export interface PresetsHost {
  editor: Editor
  data: OsmData
  builder: FeatureBuilder
  metrics: EngineMetrics
  /** Which source each drawn feature is in */
  featureSource: ReadonlyMap<string, SourceName>
  /** Whether the feature is in the live tier (an edited or late feature) rather than the big sources */
  isLive(source: SourceName, id: string): boolean
  push(batch: FeatureBatch, tier: 'base' | 'live'): void
  wake(): void
  changed(): void
}

export class PresetsHold {
  private readonly stop: () => void

  constructor(private readonly host: PresetsHost) {
    // presets that are made after the first picture: the icons of what was built without them are filled in
    this.stop = host.editor.onPresets((presets) => presets && this.fillIn(presets))
  }

  /** Work in progress that `settled()` waits for: fill-in slices to run, and features that are held */
  get pending() {
    return this.slices > 0 || this.held.length > 0
  }
  get fillingIn() {
    return this.slices
  }
  get heldCount() {
    return this.held.length
  }

  destroy() {
    this.stop()
    clearTimeout(this.fillTimer)
    clearTimeout(this.holdTimer)
    clearTimeout(this.safetyTimer)
    this.held = []
    this.slices = 0
  }

  /** Slices of the fill-in after the presets arrived that are still to run; `settled()` waits for them */
  private slices = 0
  private fillTimer?: ReturnType<typeof setTimeout>

  /**
   * Points and vertices of tiles that arrived while the presets were still being made. Their icons come from the
   * presets, so they wait for them (at most `PRESETS_HOLD_MS`) instead of being drawn bare and drawn again: lines and
   * areas, which do not depend on the presets, go to the map at once. Released when the presets arrive, or when the
   * time is up (then `fillInPresets` adds the icons later). `settled()` counts them as work in progress.
   */
  private held: { id: string; source: 'points' | 'vertices'; tier: 'base' | 'live' }[] = []
  private holdTimer?: ReturnType<typeof setTimeout>
  private safetyTimer?: ReturnType<typeof setTimeout>

  /** Takes the points and vertices out of a batch to hold them. Returns the batch as it is to be sent now. */
  hold(batch: FeatureBatch, tier: 'base' | 'live') {
    if (!this.host.editor.presetsPending) return batch
    for (const source of ['points', 'vertices'] as const) {
      for (const feature of batch[source]) {
        const id = featureId(feature)
        // an untagged vertex (a junction, the end of a way) has no icon to wait for
        if (id === undefined || (source === 'vertices' && !feature.properties?.t)) continue
        this.held.push({ id, source, tier })
      }
    }
    if (this.held.length === 0) return batch
    const holding = new Set(this.held.map((entry) => entry.id))
    batch = {
      ...batch,
      points: batch.points.filter((f) => !holding.has(String(featureId(f)))),
      vertices: batch.vertices.filter((f) => !holding.has(String(featureId(f)))),
    }
    // The shell starts the presets once `ready` is over (loadPresetsAfterReady) and `settled()` asks for them. This is
    // the net for an engine that has neither: a little later, not at once, because running the presets chunk in the
    // task of the first tile would delay whatever else is waiting for the main thread then (`ready`).
    this.safetyTimer ??= setTimeout(() => void this.host.editor.loadPresets(), PRESETS_START_MS)
    this.holdTimer ??= setTimeout(() => this.release(), PRESETS_HOLD_MS)
    return batch
  }

  /** Sends what was held, built again with the presets if they are there (with no icon if the time was up) */
  release() {
    clearTimeout(this.holdTimer)
    this.holdTimer = undefined
    const held = this.held
    if (held.length === 0) return
    this.held = []
    const sends = new Map<string, FeatureBatch>()
    for (const { id, source, tier } of held) {
      const node = this.host.data.node(id)
      if (!node) continue
      const feature =
        source === 'points'
          ? this.host.builder.buildPoint(node)
          : this.host.builder.buildVertex(node)
      if (!feature) continue
      let batch = sends.get(tier)
      if (!batch) sends.set(tier, (batch = { areas: [], lines: [], points: [], vertices: [] }))
      batch[source].push(feature)
    }
    for (const [tier, batch] of sends) this.host.push(batch, tier as 'base' | 'live')
    this.host.wake()
  }

  /**
   * The presets arrived after features were built without them. Presets only decorate the first picture: they give
   * a pin or a vertex its icon (nothing else a feature is drawn as depends on them: the geometry class comes from the
   * style package's own area keys). So the points and vertices that are drawn are built again, and only those that
   * now have an icon are sent, in slices of about 8 ms with a pause between them, as updates by id (no geometry of a
   * line or an area is touched). When the presets are there before the first tile, nothing was built and there is
   * nothing to do. Edited features (live tier) are replaced in the live tier, the others in the big sources.
   */
  fillIn(presets: Presets) {
    this.host.builder.presets = presets
    // what is drawn already was built without them (the held features are not drawn yet)
    const ids: string[] = []
    for (const [id, source] of this.host.featureSource) {
      if (source === 'points' || source === 'vertices') ids.push(id)
    }
    // what waited for the presets is built with them, and is not drawn bare at all
    this.release()
    // the type of a selected feature, read from the presets: whoever shows it reads it again
    this.host.changed()
    if (ids.length === 0) return
    this.slices++
    let at = 0
    const slice = () => {
      this.fillTimer = undefined
      const started = performance.now()
      const base: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
      const live: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
      while (at < ids.length && performance.now() - started < 8) {
        const id = ids[at++]!
        const source = this.host.featureSource.get(id)
        const node = this.host.data.node(id)
        if (
          (source !== 'points' && source !== 'vertices') ||
          !node ||
          !hasInterestingTags(node.tags)
        )
          continue
        const feature =
          source === 'points'
            ? this.host.builder.buildPoint(node)
            : this.host.builder.buildVertex(node)
        // a feature that has no icon with the presets is as it was
        if (!feature?.properties?.icon) continue
        ;(this.host.isLive(source, id) ? live : base)[source].push(feature)
      }
      this.host.push(base, 'base')
      this.host.push(live, 'live')
      this.host.metrics.fillInMs += performance.now() - started
      if (at < ids.length) {
        this.fillTimer = setTimeout(slice, 0)
        return
      }
      this.slices--
      this.host.wake()
    }
    this.fillTimer = setTimeout(slice, 0)
  }
}
