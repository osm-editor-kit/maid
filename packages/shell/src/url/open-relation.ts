import { OsmRelation } from '@osm-editor-kit/maid-model'
import { useEffect, useRef } from 'react'
import {
  currentOpenRelationId,
  openRelationActions,
  useOpenRelationId,
} from '../modules/relations-open-store'
import { useEngine, useShell } from '../shell-context'
import { useOpenRelationParam } from './state'

/**
 * Keeps the open relation (relations-open-store.ts) and the URL's `relation` in step, as the selection and `id` are: a
 * link or a reload opens the relation again beside its selected member, back and forward follow it. Nothing selected
 * (no `id`) closes it. Selecting one relation opens it, unless it is a member of the open one (a sub-route picked in
 * its superroute's list): another relation takes the open one's place. Mounted once, by the app.
 */
export function useOpenRelationUrl(ids: readonly string[]) {
  const { editor } = useShell()
  const selected = ids.length
  // one relation selected (a click on the map, a link with only `id=r…`): its members open beside the inspector
  const onlyRelation = ids.length === 1 && ids[0]?.startsWith('r') ? ids[0] : null
  const [param, setParam] = useOpenRelationParam()
  const open = useOpenRelationId()
  // whether the open relation is in the data: a link's relation arrives later, and only then can its members be read
  const openLoaded = useEngine(
    () => open !== null && editor.history.staging.graph.hasEntity(open) !== undefined,
  )
  // the URL first: at start (and on back or forward) it opens the relation it names
  useEffect(
    function openTheRelationOfTheUrl() {
      if (param === currentOpenRelationId()) return
      if (param) openRelationActions.open(param)
      else openRelationActions.close()
    },
    [param],
  )
  // then the URL follows the store; read live, so the start value just opened is not written away
  useEffect(
    function writeTheOpenRelationToTheUrl() {
      const now = currentOpenRelationId()
      if (now !== param) void setParam(now)
    },
    [open, param, setParam],
  )
  useEffect(
    function closeWhenNothingIsSelected() {
      if (selected === 0 && currentOpenRelationId() !== null) openRelationActions.close()
    },
    [selected],
  )
  // the selection that was last decided on: closing the column while it stays selected keeps the column closed
  const decided = useRef<string | null>(null)
  useEffect(
    function openASelectedRelation() {
      // something else selected: a later click on the same relation opens it again
      if (onlyRelation === null) {
        decided.current = null
        return
      }
      const open = currentOpenRelationId()
      if (open === onlyRelation || decided.current === onlyRelation) return
      if (open !== null) {
        const current = editor.history.staging.graph.hasEntity(open)
        // a link's open relation not loaded yet: it stays, as the URL says, and this is decided once it is there
        if (!(current instanceof OsmRelation)) return
        decided.current = onlyRelation
        if (current.members.some((member) => member.id === onlyRelation)) return
      }
      decided.current = onlyRelation
      openRelationActions.open(onlyRelation)
    },
    [onlyRelation, editor, openLoaded],
  )
}
