// Adopted from iD test/spec/validations/crossing_ways.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { dataOf, graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import type { Scene } from '../id-test-helpers.ts'
import type { Issue } from '../types.ts'
import { crossingWays } from './crossing-ways.ts'

// Numbers in iD's tags (layer: -1) are written as the strings OSM stores: layer: '-1'.
// Maid's Issue has no `type`: the rule is `issue.rule`. The connection tags are `issue.data`.

/** Two ways that cross once at (1.5, 1.5), with these tags */
function oneCrossing(tags1: Record<string, string>, tags2: Record<string, string>): Scene {
  return {
    graph: graphOf(
      node('n-1', 1, 1),
      node('n-2', 2, 2),
      way('w-1', ['n-1', 'n-2'], tags1),
      node('n-3', 1, 2),
      node('n-4', 2, 1),
      way('w-2', ['n-3', 'n-4'], tags2),
    ),
    ids: ['n-1', 'n-2', 'w-1', 'n-3', 'n-4', 'w-2'],
  }
}

/** Two residential roads that cross twice: at (1.5, 1.5) and (2.5, 2.5) */
function twoCrossings(): Scene {
  return {
    graph: graphOf(
      node('n-1', 1, 1),
      node('n-2', 3, 3),
      way('w-1', ['n-1', 'n-2'], { highway: 'residential' }),
      node('n-3', 1, 2),
      node('n-4', 2, 1),
      node('n-5', 3, 2),
      node('n-6', 2, 3),
      way('w-2', ['n-3', 'n-4', 'n-5', 'n-6'], { highway: 'residential' }),
    ),
    ids: ['n-1', 'n-2', 'w-1', 'n-3', 'n-4', 'n-5', 'n-6', 'w-2'],
  }
}

function validate(scene: Scene): Issue[] {
  return validateChanged(crossingWays, scene.graph, scene.ids)
}

/**
 * iD's verifySingleCrossingIssue: each of the two ways produces an identical issue at (1.5, 1.5),
 * with these connection tags (null when the two may not be joined).
 */
function verifySingleCrossingIssue(issues: Issue[], connectionTags: Record<string, string> | null) {
  expect(issues).toHaveLength(2)
  expect(issues[0]?.id).toEqual(issues[1]?.id)

  for (const issue of issues) {
    expect(issue.rule).toEqual('crossing_ways')
    expect(issue.severity).toEqual('warning')
    expect(issue.entityIds).toHaveLength(2)

    expect(issue.loc).toHaveLength(2)
    expect(issue.loc?.[0]).toEqual(1.5)
    expect(issue.loc?.[1]).toEqual(1.5)

    expect(dataOf(issue).connectionTags).toEqual(connectionTags)
  }
}

describe('iD.validations.crossing_ways', () => {
  it('has no errors on init', () => {
    expect(validateChanged(crossingWays, graphOf(), [])).toHaveLength(0)
  })

  it('ignores untagged line crossing untagged line', () => {
    expect(validate(oneCrossing({}, {}))).toHaveLength(0)
  })

  it('ignores road crossing abandoned railway', () => {
    expect(
      validate(oneCrossing({ highway: 'residential' }, { railway: 'abandoned' })),
    ).toHaveLength(0)
  })

  it('ignores road crossing non-rail railway', () => {
    expect(validate(oneCrossing({ highway: 'residential' }, { railway: 'yard' }))).toHaveLength(0)
  })

  it('ignores road crossing non-water waterway', () => {
    expect(validate(oneCrossing({ highway: 'residential' }, { waterway: 'fuel' }))).toHaveLength(0)
  })

  it('ignores road crossing non-building building', () => {
    expect(validate(oneCrossing({ highway: 'residential' }, { building: 'no' }))).toHaveLength(0)
  })

  it('ignores road crossing non-routable highway', () => {
    expect(validate(oneCrossing({ highway: 'services' }, { highway: 'residential' }))).toHaveLength(
      0,
    )
  })

  // legit crossing cases
  it('ignores road tunnel crossing road', () => {
    expect(
      validate(
        oneCrossing(
          { highway: 'residential', tunnel: 'yes', layer: '-1' },
          { highway: 'residential' },
        ),
      ),
    ).toHaveLength(0)
  })

  it('ignores road crossing railway bridge', () => {
    expect(
      validate(oneCrossing({ highway: 'residential' }, { railway: 'rail', bridge: 'yes' })),
    ).toHaveLength(0)
  })

  it('ignores road bridge crossing waterway', () => {
    expect(
      validate(oneCrossing({ highway: 'residential', bridge: 'yes' }, { waterway: 'river' })),
    ).toHaveLength(0)
  })

  it('ignores road crossing road on different layers', () => {
    expect(
      validate(oneCrossing({ highway: 'path', layer: '-5' }, { highway: 'path', layer: '-4' })),
    ).toHaveLength(0)
  })

  it('ignores road crossing road on different levels', () => {
    expect(
      validate(oneCrossing({ highway: 'path', level: '-5' }, { highway: 'path', level: '-4' })),
    ).toHaveLength(0)
  })

  it('ignores indoor highways crossing each other on different levels', () => {
    expect(
      validate(
        oneCrossing(
          { highway: 'path', indoor: 'yes', level: '-5' },
          { highway: 'path', indoor: 'yes', level: '-4' },
        ),
      ),
    ).toHaveLength(0)
  })

  it('ignores road crossing building on different layers', () => {
    expect(
      validate(oneCrossing({ highway: 'residential', layer: '-1' }, { building: 'yes' })),
    ).toHaveLength(0)
  })

  it('ignores railway crossing railway bridge', () => {
    expect(
      validate(oneCrossing({ railway: 'rail', bridge: 'yes' }, { railway: 'rail' })),
    ).toHaveLength(0)
  })

  it('ignores railway bridge crossing railway bridge on different layers', () => {
    expect(
      validate(
        oneCrossing(
          { railway: 'rail', bridge: 'yes', layer: '2' },
          { railway: 'rail', bridge: 'yes' },
        ),
      ),
    ).toHaveLength(0)
  })

  it('ignores railway crossing waterway tunnel', () => {
    expect(
      validate(oneCrossing({ railway: 'rail' }, { waterway: 'river', tunnel: 'yes' })),
    ).toHaveLength(0)
  })

  it('ignores railway crossing building on different layers', () => {
    expect(
      validate(oneCrossing({ railway: 'rail', layer: '-1' }, { building: 'yes' })),
    ).toHaveLength(0)
  })

  it('ignores waterway crossing waterway tunnel', () => {
    expect(
      validate(oneCrossing({ waterway: 'canal', tunnel: 'yes' }, { waterway: 'river' })),
    ).toHaveLength(0)
  })

  it('ignores waterway crossing building on different layers', () => {
    expect(
      validate(oneCrossing({ waterway: 'river', layer: '-1' }, { building: 'yes' })),
    ).toHaveLength(0)
  })

  it('ignores building crossing building on different layers', () => {
    expect(
      validate(oneCrossing({ building: 'yes' }, { building: 'yes', layer: '1' })),
    ).toHaveLength(0)
  })

  it('ignores corridor crossing corridor on different levels', () => {
    expect(
      validate(
        oneCrossing({ highway: 'corridor', level: '0' }, { highway: 'corridor', level: '1' }),
      ),
    ).toHaveLength(0)
  })

  it('ignores a routable aeroway crossing a non-routable aeroway', () => {
    expect(validate(oneCrossing({ aeroway: 'taxiway' }, { aeroway: 'aerodrome' }))).toHaveLength(0)
  })

  it('ignores an aeroway crossing a road tunnel', () => {
    expect(
      validate(
        oneCrossing({ aeroway: 'runway' }, { highway: 'trunk', tunnel: 'yes', layer: '-1' }),
      ),
    ).toHaveLength(0)
  })

  it('ignores an aeroway crossing a road bridge', () => {
    expect(
      validate(oneCrossing({ aeroway: 'runway' }, { highway: 'trunk', bridge: 'yes', layer: '1' })),
    ).toHaveLength(0)
  })

  it('ignores an aeroway crossing a rail tunnel', () => {
    expect(
      validate(
        oneCrossing({ aeroway: 'runway' }, { railway: 'track', tunnel: 'yes', layer: '-1' }),
      ),
    ).toHaveLength(0)
  })

  it('ignores an aeroway crossing a rail bridge', () => {
    expect(
      validate(oneCrossing({ aeroway: 'runway' }, { railway: 'track', bridge: 'yes', layer: '1' })),
    ).toHaveLength(0)
  })

  it('ignores an aeroway bridge crossing a road', () => {
    expect(
      validate(
        oneCrossing(
          { aeroway: 'runway', bridge: 'yes', layer: '2' },
          { highway: 'trunk', layer: '1' },
        ),
      ),
    ).toHaveLength(0)
  })

  it('ignores an aeroway bridge crossing a railway', () => {
    expect(
      validate(oneCrossing({ aeroway: 'runway', bridge: 'yes', layer: '1' }, { railway: 'track' })),
    ).toHaveLength(0)
  })

  it('ignores an aeroway crossing a culvert', () => {
    expect(
      validate(
        oneCrossing({ aeroway: 'taxiway' }, { waterway: 'ditch', tunnel: 'culvert', layer: '-1' }),
      ),
    ).toHaveLength(0)
  })

  it('ignores an aeroway crossing a building on a different layer', () => {
    expect(
      validate(oneCrossing({ aeroway: 'runway' }, { building: 'yes', layer: '0.5' })),
    ).toHaveLength(0)
  })

  // warning crossing cases between ways
  it('flags road crossing road', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'residential' }, { highway: 'residential' })),
      {},
    )
  })

  it('flags road crossing footway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'residential' }, { highway: 'footway' })),
      {
        highway: 'crossing',
      },
    )
  })

  it('flags road crossing cycleway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'residential' }, { highway: 'cycleway' })),
      {
        highway: 'crossing',
      },
    )
  })

  it('flags road crossing marked crosswalk', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing({ highway: 'residential' }, { highway: 'footway', crossing: 'uncontrolled' }),
      ),
      { highway: 'crossing', crossing: 'uncontrolled' },
    )
  })

  it('flags road crossing marked crosswalk (alternative tagging)', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'residential' }, { highway: 'footway', crossing: 'marked' })),
      { highway: 'crossing', crossing: 'marked' },
    )
  })

  it('flags road crossing crosswalk with traffic_signals', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential' },
          { highway: 'footway', crossing: 'traffic_signals' },
        ),
      ),
      { highway: 'crossing', crossing: 'traffic_signals' },
    )
  })

  it('flags road crossing unmarked crosswalk', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing({ highway: 'residential' }, { highway: 'footway', crossing: 'unmarked' }),
      ),
      { highway: 'crossing', crossing: 'unmarked' },
    )
  })

  it('copies over `crossing:markings`', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential' },
          { highway: 'footway', crossing: 'marked', 'crossing:markings': 'zebra' },
        ),
      ),
      { highway: 'crossing', crossing: 'marked', 'crossing:markings': 'zebra' },
    )
  })

  it('does not copy `crossing` and `crossing:markings` if the `crossing` tag has an unknown value', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential' },
          { highway: 'footway', crossing: 'zebra', 'crossing:markings': 'zebra' },
        ),
      ),
      { highway: 'crossing' },
    )
  })

  it('flags road=track crossing footway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'track' }, { highway: 'footway' })),
      {},
    )
  })

  it('flags cycleway crossing cycleway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'cycleway' }, { highway: 'cycleway' })),
      {},
    )
  })

  it('flags cycleway crossing footway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'cycleway' }, { highway: 'footway' })),
      {},
    )
  })

  it('flags footway crossing footway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'footway' }, { highway: 'footway' })),
      {},
    )
  })

  it('flags road crossing railway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'residential' }, { railway: 'rail' })),
      {
        railway: 'level_crossing',
      },
    )
  })

  it('flags footway crossing railway', () => {
    verifySingleCrossingIssue(validate(oneCrossing({ highway: 'footway' }, { railway: 'rail' })), {
      railway: 'crossing',
    })
  })

  it('flags cycleway crossing railway', () => {
    verifySingleCrossingIssue(validate(oneCrossing({ highway: 'cycleway' }, { railway: 'rail' })), {
      railway: 'crossing',
    })
  })

  it('flags minor road crossing waterway', () => {
    const issues = validate(oneCrossing({ highway: 'residential' }, { waterway: 'river' }))
    verifySingleCrossingIssue(issues, { ford: 'yes' })
    expect(dataOf(issues[0]).featureTypes).toEqual(['highway', 'waterway'])
  })

  it('flags major road crossing waterway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'motorway' }, { waterway: 'river' })),
      null,
    )
  })

  it('flags road crossing building', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'residential' }, { building: 'yes' })),
      null,
    )
  })

  it('flags railway crossing railway', () => {
    verifySingleCrossingIssue(validate(oneCrossing({ railway: 'rail' }, { railway: 'rail' })), {
      railway: 'railway_crossing',
    })
  })

  it('flags railway crossing waterway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ railway: 'rail' }, { waterway: 'river' })),
      null,
    )
  })

  it('flags road bridge crossing road on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential', bridge: 'yes', layer: '1' },
          { highway: 'tertiary', layer: '1' },
        ),
      ),
      {},
    )
  })

  it('flags road bridge crossing road bridge on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential', bridge: 'yes' },
          { highway: 'tertiary', bridge: 'yes' },
        ),
      ),
      {},
    )
  })

  it('flags road bridge crossing aqueduct on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential', bridge: 'yes' },
          { waterway: 'canal', bridge: 'aqueduct' },
        ),
      ),
      null,
    )
  })

  it('flags road tunnel crossing road on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential', tunnel: 'yes', layer: '-1' },
          { highway: 'tertiary', layer: '-1' },
        ),
      ),
      {},
    )
  })

  it('flags a crossing where only one feature is indoor', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ highway: 'path' }, { highway: 'path', level: '1' })),
      {},
    )
  })

  it('flags road tunnel crossing waterway tunnel on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing(
          { highway: 'residential', tunnel: 'yes' },
          { waterway: 'canal', tunnel: 'yes' },
        ),
      ),
      null,
    )
  })

  it('flags railway bridge crossing road bridge on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing({ highway: 'residential', bridge: 'yes' }, { railway: 'rail', bridge: 'yes' }),
      ),
      { railway: 'level_crossing' },
    )
  })

  it('flags railway crossing building', () => {
    verifySingleCrossingIssue(validate(oneCrossing({ railway: 'rail' }, { building: 'yes' })), null)
  })

  it('flags waterway crossing waterway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ waterway: 'canal' }, { waterway: 'canal' })),
      {},
    )
  })

  it('flags waterway tunnel crossing waterway tunnel on the same layer', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing({ waterway: 'canal', tunnel: 'yes' }, { waterway: 'canal', tunnel: 'yes' }),
      ),
      {},
    )
  })

  it('flags waterway crossing building', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ waterway: 'river' }, { building: 'yes' })),
      null,
    )
  })

  it('flags building crossing building', () => {
    verifySingleCrossingIssue(validate(oneCrossing({ building: 'yes' }, { building: 'yes' })), null)
  })

  it('flags corridor crossing corridor on the same level', () => {
    verifySingleCrossingIssue(
      validate(
        oneCrossing({ highway: 'corridor', level: '0' }, { highway: 'corridor', level: '0' }),
      ),
      {},
    )
  })

  it('flags road crossing road twice', () => {
    const issues = validate(twoCrossings())
    expect(issues).toHaveLength(4)
    const first = issues[0]
    expect(first?.rule).toEqual('crossing_ways')
    expect(first?.entityIds).toHaveLength(2)
    expect(first?.loc).toHaveLength(2)
    expect(first?.loc?.[0]).toEqual(1.5)
    expect(first?.loc?.[1]).toEqual(1.5)

    const second = issues[1]
    expect(second?.rule).toEqual('crossing_ways')
    expect(second?.entityIds).toHaveLength(2)
    expect(second?.loc).toHaveLength(2)
    expect(second?.loc?.[0]).toEqual(2.5)
    expect(second?.loc?.[1]).toEqual(2.5)
  })

  // The test also reads iD's dynamic fixes (five of them, with `_connectionTags`)
  // needs F-validations-2
  it.todo('flags sidewalk crossing service road', () => {})

  // Multipolygon relations: Maid checks ways only
  // needs F-validations-1
  it.todo('ignores road line crossing relation with building=yes without a type', () => {})
  it.todo('ignores road line crossing type=building relation', () => {})
  it.todo('ignores road line crossing waterway multipolygon relation', () => {})
  it.todo('flags road line crossing building multipolygon relation', () => {})
  it.todo('flags footway line crossing footway multipolygon relation', () => {})
  it.todo('flags road line crossing footway multipolygon relation', () => {})
  it.todo('flags railway line crossing footway multipolygon relation', () => {})
  it.todo('flags waterway line crossing footway multipolygon relation', () => {})

  it('flags an aeroway crosing another aeroway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'runway' }, { aeroway: 'taxiway' })),
      {},
    )
  })

  it('flags an aeroway crosing a major road', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'runway' }, { highway: 'motorway' })),
      {
        aeroway: 'aircraft_crossing',
      },
    )
  })

  it('flags an aeroway crosing a service road', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'runway' }, { highway: 'service' })),
      {},
    )
  })

  it('flags an aeroway crosing a path', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'runway' }, { highway: 'corridor' })),
      {},
    )
  })

  it('flags an aeroway crosing a railway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'taxiway' }, { railway: 'disused' })),
      {
        aeroway: 'aircraft_crossing',
        railway: 'level_crossing',
      },
    )
  })

  it('flags an aeroway crosing a waterway', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'runway' }, { waterway: 'canal' })),
      null,
    )
  })

  it('flags an aeroway crosing a building', () => {
    verifySingleCrossingIssue(
      validate(oneCrossing({ aeroway: 'runway' }, { building: 'hangar' })),
      null,
    )
  })
})
