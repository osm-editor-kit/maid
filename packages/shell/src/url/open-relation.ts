import { useEffect } from 'react'
import {
  currentOpenRelationId,
  openRelationActions,
  useOpenRelationId,
} from '../modules/relations-open-store'
import { useOpenRelationParam } from './state'

/**
 * Keeps the open relation (relations-open-store.ts) and the URL's `relation` in step, as the selection and `id` are: a
 * link or a reload opens the relation again beside its selected member, back and forward follow it. Nothing selected
 * (no `id`) closes it, and selecting one relation opens it. Mounted once, by the app.
 */
export function useOpenRelationUrl(ids: readonly string[]) {
  const selected = ids.length
  // one relation selected (a click on the map, a link with only `id=r…`): its members open beside the inspector
  const onlyRelation = ids.length === 1 && ids[0]?.startsWith('r') ? ids[0] : null
  const [param, setParam] = useOpenRelationParam()
  const open = useOpenRelationId()
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
  useEffect(
    function openASelectedRelation() {
      if (onlyRelation !== null && currentOpenRelationId() === null)
        openRelationActions.open(onlyRelation)
    },
    [onlyRelation],
  )
}
