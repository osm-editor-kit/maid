import { keepNewFeatureOnly } from './new-feature'
import { useShell } from './shell-context'
import { dropStackUnless } from './stack'
import { useSelectedId } from './url/state'

/**
 * What is selected. The URL holds it (`id=w1,n2`, as iD does) and the engine shows it; `select`
 * changes both. `id` is the first selected entity, the one the inspector shows.
 */
export function useSelection() {
  const { engine } = useShell()
  const [param, setParam] = useSelectedId()
  const ids = param ? param.split(',') : []
  const select = (selection: string | readonly string[] | null) => {
    const next = selection === null ? [] : typeof selection === 'string' ? [selection] : selection
    // the features of a click's stack keep it; any other selection drops it (stack.ts)
    dropStackUnless(next)
    keepNewFeatureOnly(next)
    engine.setSelected(next)
    void setParam(next.length ? next.join(',') : null)
  }
  return { ids, id: ids[0] ?? null, param, select }
}
