import { beforeAll, describe, expect, it } from 'bun:test'
import { createPresets } from '@osm-editor-kit/maid-presets'
import type { Presets } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { dataOf, graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import type { PresetLookup } from '../types.ts'
import { createValidator } from '../validator.ts'
import { outdatedTags } from './outdated-tags.ts'

let presets: Presets

beforeAll(() => {
  presets = createPresets(defaultPresetData)
})

describe('outdated tags with the schema data', () => {
  it('reports a preset that adds a tag the feature lacks (incomplete tags)', () => {
    // waterway=lock_gate: the preset adds seamark:type=gate
    const graph = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      way('w-1', ['n-1', 'n-2'], { waterway: 'lock_gate' }),
    )
    const issues = validateChanged(outdatedTags, graph, ['n-1', 'n-2', 'w-1'], presets)
    expect(issues).toHaveLength(1)
    expect(dataOf(issues[0]).subtype).toBe('incomplete_tags')
    expect(dataOf(issues[0]).tagDiff).toEqual([{ type: '+', key: 'seamark:type', newVal: 'gate' }])
  })

  it('upgrades a replaced preset (highway=bus_stop on a point)', () => {
    const graph = graphOf(node('n-1', 4, 4, { highway: 'bus_stop' }))
    const issues = validateChanged(outdatedTags, graph, ['n-1'], presets)
    expect(issues).toHaveLength(1)
    const diff = dataOf(issues[0]).tagDiff as { type: string; key: string }[]
    // the replacement's tags are added, the old tag is not changed
    expect(diff.some((change) => change.type === '+' && change.key === 'public_transport')).toBe(
      true,
    )
  })

  it('reports nothing for a feature without the presets, until they are there', () => {
    const graph = graphOf(node('n-1', 4, 4, { highway: 'bus_stop' }))
    expect(validateChanged(outdatedTags, graph, ['n-1'], undefined)).toHaveLength(0)
  })
})

describe('the validator with presets that arrive later', () => {
  it('reports the issues once the presets are given to the next run', () => {
    const lookupWithFord = withDeprecated([{ old: { highway: 'ford' }, replace: { ford: '*' } }])
    let current: PresetLookup | undefined
    const validator = createValidator([outdatedTags], { presets: () => current })
    const graph = graphOf(
      way('w-1', ['n-1', 'n-2'], { highway: 'ford' }),
      node('n-1', 4, 4),
      node('n-2', 4, 5),
    )
    validator.validate(graph, ['w-1'], [])
    expect(validator.issues()).toHaveLength(0)
    current = lookupWithFord
    validator.validate(graph, ['w-1'], [])
    expect(validator.issues()).toHaveLength(1)
  })
})

describe('ignored warnings', () => {
  const graph = graphOf(
    way('w-1', ['n-1', 'n-2'], { highway: 'ford' }),
    node('n-1', 4, 4),
    node('n-2', 4, 5),
  )

  // the presets with the list, made once: a run reads them
  const lookup = withDeprecated([{ old: { highway: 'ford' }, replace: { ford: '*' } }])

  function validatorIgnoring(ignored: Set<string>) {
    const validator = createValidator([outdatedTags], {
      presets: () => lookup,
      ignored: () => ignored,
    })
    validator.validate(graph, ['w-1'], [])
    return validator
  }

  it('leaves an ignored warning out of the issues, the entity and the shared issues, and counts it', () => {
    const shown = validatorIgnoring(new Set())
    const [issue] = shown.issues()
    expect(issue).toBeDefined()
    const ignored = validatorIgnoring(new Set([issue!.id]))
    expect(ignored.issues()).toHaveLength(0)
    expect(ignored.issuesFor('w-1')).toHaveLength(0)
    expect(ignored.issuesForAll(['w-1'])).toHaveLength(0)
    expect(ignored.ignoredIssues().map((i) => i.id)).toEqual([issue!.id])
  })

  it('never ignores an error', () => {
    const validator = createValidator(
      [
        {
          id: 'always_error',
          label: 'Always an error',
          validate: (entity) => [
            {
              id: `always_error:${entity.id}`,
              rule: 'always_error',
              severity: 'error',
              message: 'Broken',
              entityIds: [entity.id],
              fixes: [],
            },
          ],
        },
      ],
      { ignored: () => new Set(['always_error:w-1']) },
    )
    validator.validate(graph, ['w-1'], [])
    expect(validator.issues()).toHaveLength(1)
    expect(validator.ignoredIssues()).toHaveLength(0)
  })

  it('shows the warning again when it is no longer ignored', () => {
    const shown = validatorIgnoring(new Set())
    const [issue] = shown.issues()
    const ignored = validatorIgnoring(new Set([issue!.id]))
    expect(ignored.issues()).toHaveLength(0)
    const back = validatorIgnoring(new Set())
    expect(back.issues()).toHaveLength(1)
    expect(back.ignoredIssues()).toHaveLength(0)
  })
})

/** Presets of the schema with another list of deprecated tags */
function withDeprecated(deprecated: unknown[]): Presets {
  return createPresets({ ...defaultPresetData, deprecated })
}
