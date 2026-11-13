// Several operations as one entry of the edit menu: the entry opens a flyout of those that apply (Tobias, 2026-11-13:
// "Extract" with its sides and kinds as one item with a second level, not twelve rows). The group is an operation
// whose `choices` are its members; a choice runs, previews and refuses as that member does.
import type { OperationHost } from './index.ts'
import type { Operation, OperationContext, OperationGroup } from './types.ts'

export type OperationGroupSpec = {
  id: string
  /** The entry's name. A function, so that it is read in the language of the moment. */
  label: () => string
  icon?: string
  group?: OperationGroup
  members: readonly Operation[]
}

/** The members that apply to this selection, in the members' order */
function applying(members: readonly Operation[], context: OperationContext): Operation[] {
  return members.filter((member) => member.applies(context))
}

/**
 * One edit menu entry for several operations. It applies when one of its members does; its flyout lists those, each
 * with its own label and its own reason when it cannot run. Without a choice (a key, or a single member) it is the
 * first member that can run. Register the group instead of its members.
 */
export function operationGroup(spec: OperationGroupSpec): Operation {
  const { members } = spec
  /** The member a choice names, or the first one that applies and can run */
  const memberOf = (context: OperationContext): Operation | undefined => {
    const found = applying(members, context)
    if (context.choice !== undefined) return found.find((member) => member.id === context.choice)
    return found.find((member) => member.disabled(context) === undefined) ?? found[0]
  }
  // the engine calls `start` instead of `run` when an operation has one: the members either all run or all start
  const withStart = members.some((member) => member.start !== undefined)
  if (withStart && members.some((member) => member.start === undefined))
    throw new Error(`${spec.id}: its members either all run or all start`)
  const group: Operation = {
    id: spec.id,
    get label() {
      return spec.label()
    },
    ...(spec.icon !== undefined && { icon: spec.icon }),
    ...(spec.group !== undefined && { group: spec.group }),
    applies: (context) => applying(members, context).length > 0,
    disabled: (context) => {
      const member = memberOf(context)
      return member ? member.disabled(context) : undefined
    },
    choices: (context) =>
      applying(members, context).map((member) => ({ id: member.id, label: member.label })),
    details: (context) => memberOf(context)?.details?.(context),
    run: (context) => {
      const member = memberOf(context)
      if (!member) throw new Error(`${spec.id}: no member applies`)
      return member.run(context)
    },
  }
  // the lines a member marks while hovered; only when every member has them: a member without them is shown by the
  // outlines its run gives, which the engine draws for an operation without `preview`
  if (members.every((member) => member.preview !== undefined)) {
    group.preview = (context) => memberOf(context)?.preview?.(context) ?? []
  }
  if (withStart) {
    group.start = (context: OperationContext, host: OperationHost) => {
      const member = memberOf(context)
      if (member?.start) member.start(context, host)
      else if (member) throw new Error(`${spec.id}: ${member.id} runs, it does not start`)
    }
  }
  return group
}
