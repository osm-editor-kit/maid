/**
 * Writing tags: one tag, the same change on several features, each feature its own change, or each its own
 * full tags, always as one undo step with a refusal when a feature is read-only (the plans are in
 * change-tags.ts and set-tags-each.ts). Owned by the engine as `engine.tagEdits`; the engine keeps the
 * delegating methods the shell calls.
 */
import { type CombinedTags, combinedTags } from '@osm-editor-kit/maid-model'
import type { Tags } from '@osm-editor-kit/maid-style'
import {
  type ChangeTagsResult,
  planChangeTags,
  planChangeTagsEach,
  type TagChangeEach,
  type TagChangeRequest,
} from './change-tags'
import type { MaidEngine } from './engine'
import { planSetTagsEach, type TagsOfFeature } from './set-tags-each'

export class TagEdits {
  constructor(private engine: MaidEngine) {}

  /**
   * Sets or removes one tag of an entity and redraws it with the look the new tags give it.
   * Local only: nothing is uploaded. The change is one undo step.
   */
  setTag(id: string, key: string, value: string | undefined) {
    if (value === undefined || value === '') this.changeTags([id], { remove: [key] })
    else this.changeTags([id], { set: { [key]: value } })
  }

  /**
   * Writes a change to the tags of several features as one undo step, with the label `annotation`.
   * `set` writes a key to every feature, `remove` deletes it where present (see `cleanTagChange`: an
   * empty `set` value is dropped, so a blank never clears a key). A feature that the change leaves as
   * it is is not touched. Refused, with nothing written, when an id is not in the graph or when any
   * selected feature is read-only: the result says how many of how many are read-only.
   * Redraws every changed feature, as for any tag change.
   */
  changeTags(
    ids: readonly string[],
    change: TagChangeRequest,
    annotation = 'Changed tags',
  ): ChangeTagsResult {
    const plan = planChangeTags(this.engine.data.history.staging.graph, ids, change, (id) =>
      this.engine.isReadOnly(id),
    )
    if (!plan.ok) return plan
    if (plan.changed > 0) {
      const { history } = this.engine.data
      this.engine.change(() => {
        history.perform(...plan.actions)
        history.commit({ annotation, selectedIDs: [...new Set(ids)] })
      })
    }
    return { ok: true, changed: plan.changed }
  }

  /**
   * `changeTags` with each feature's own change: `changes` lists the features and what each one writes (a
   * sheet of several features renames a key on each feature and keeps that feature's value). One undo step,
   * with the same refusals as `changeTags`: nothing is written when a feature is missing or read-only.
   */
  changeTagsEach(changes: readonly TagChangeEach[], annotation = 'Changed tags'): ChangeTagsResult {
    const plan = planChangeTagsEach(this.engine.data.history.staging.graph, changes, (id) =>
      this.engine.isReadOnly(id),
    )
    if (!plan.ok) return plan
    if (plan.changed > 0) {
      const { history } = this.engine.data
      const selectedIDs = [...new Set(changes.map((change) => change.id))]
      this.engine.change(() => {
        history.perform(...plan.actions)
        history.commit({ annotation, selectedIDs })
      })
    }
    return { ok: true, changed: plan.changed }
  }

  /**
   * Writes each feature its own full tags (a key not listed is removed) as one undo step, with the
   * label `annotation`: the type picker gives each feature the new preset's tags, computed from its
   * own. Same refusals and result as `changeTags` (see `planSetTagsEach`); a feature whose tags are
   * already those is not touched. Redraws every changed feature.
   */
  setTagsEach(changes: readonly TagsOfFeature[], annotation = 'Changed tags'): ChangeTagsResult {
    const plan = planSetTagsEach(this.engine.data.history.staging.graph, changes, (id) =>
      this.engine.isReadOnly(id),
    )
    if (!plan.ok) return plan
    if (plan.changed > 0) {
      const { history } = this.engine.data
      const selectedIDs = [...new Set(changes.map((change) => change.id))]
      this.engine.change(() => {
        history.perform(...plan.actions)
        history.commit({ annotation, selectedIDs })
      })
    }
    return { ok: true, changed: plan.changed }
  }

  /**
   * The combined tags of several features, for the inspector: per key the one value every feature has,
   * or the values that differ (see `combinedTags` in the model). For one feature every key is `one`.
   * Reads the staging graph. An id that is not in the graph is left out.
   */
  combinedTagsOf(ids: readonly string[]): CombinedTags {
    const graph = this.engine.data.history.staging.graph
    const tagsOfEach: Tags[] = []
    for (const id of ids) {
      const entity = graph.hasEntity(id)
      if (entity) tagsOfEach.push(entity.tags)
    }
    return combinedTags(tagsOfEach)
  }
}
