/**
 * Carry and set-on-all as plans (docs/research/way-table.md, 4.6 and 4.7). Pure.
 *
 * - Targets: the ways of the chain on a side, nearest first. The chain stops at a junction, so a carry does not
 *   guess past one. `both` takes N ways on each side, alternating (left, right, left, ...).
 * - Modes: `fill-empty` (the default) writes where the key is missing; `overwrite` writes where the value differs or
 *   the key is missing ("set on all" is this mode over every other way of the chain).
 * - Direction: a direction-dependent row (a directional key, or a value that the mirror changes) is not carried to a
 *   reversed target. It is skipped with the reason `direction-dependent`, because the value would mean the opposite.
 * - A read-only target refuses the whole plan (plan.ts).
 *
 * The value is the chain-direction value of the reference, which is its stored value, since the reference is not
 * reversed.
 */
import type { WayChain } from './chain.ts'
import { isDirectionDependent } from './mirror.ts'
import { planEdit, type PlanResult, type PlanTarget } from './plan.ts'
import type { Direction } from './types.ts'

/** A direction in the chain, or both sides */
export type CarryDirection = Direction | 'both'

/** `fill-empty` writes only where the key is missing; `overwrite` also where the value differs */
export type CarryMode = 'fill-empty' | 'overwrite'

/**
 * The ids of the next `count` ways of the chain on one side (or both), nearest first. The reference is not a target.
 * Ways beyond a junction are not in the chain, so they are not targets either.
 */
export function carryTargets(chain: WayChain, direction: CarryDirection, count: number): string[] {
  const left = chain.ways
    .slice(0, chain.centerIndex)
    .reverse()
    .slice(0, Math.max(0, count))
    .map((way) => way.id)
  const right = chain.ways
    .slice(chain.centerIndex + 1)
    .slice(0, Math.max(0, count))
    .map((way) => way.id)
  if (direction === 'backward') return left
  if (direction === 'forward') return right

  const both: string[] = []
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const a = left[i]
    const b = right[i]
    if (a !== undefined) both.push(a)
    if (b !== undefined) both.push(b)
  }
  return both
}

export type CarryRequest = {
  /** The key in chain direction (the reference's key) */
  readonly key: string
  /** The value to carry */
  readonly value: string
  /** The targets, in the order they should be written (nearest first) */
  readonly targets: readonly PlanTarget[]
  readonly mode: CarryMode
}

/** The plan of a carry of one key and value to the targets */
export function planCarry(request: CarryRequest): PlanResult {
  const { key, value, mode } = request
  return planEdit(request.targets, (target) => {
    if (value === '') return { skip: 'no-change' }
    if (target.reversed && isDirectionDependent(key, value, target.tags))
      return { skip: 'direction-dependent' }

    const current = target.tags[key]
    if (current === value) return { skip: 'same-value' }
    if (mode === 'fill-empty' && current) return { skip: 'already-set' }
    return { set: { [key]: value } }
  })
}

/** Set on all: the reference's value on every other way of the chain where it differs or is missing */
export function planSetOnAll(request: Omit<CarryRequest, 'mode'>): PlanResult {
  return planCarry({ ...request, mode: 'overwrite' })
}
