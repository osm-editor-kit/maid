import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
/**
 * Cuts the scenes from a LOCAL .osm.pbf with osmium and writes OSM API JSON.
 * Never downloads anything (core rule 1). Run by a person on purpose:
 *
 *   bun run fixtures-build /path/to/berlin-latest.osm.pbf
 *   bun run fixtures-build /path/to/berlin-latest.osm.pbf --scene relations
 *
 * `--scene` builds only the named scenes (repeatable, or `a,b`); the others stay as they are.
 */
import { $ } from 'bun'
import { getScene, SCENES, type Scene } from './scenes'

type Element =
  | {
      type: 'node'
      id: number
      lat: number
      lon: number
      version: number
      tags?: Record<string, string>
    }
  | { type: 'way'; id: number; version: number; nodes: number[]; tags?: Record<string, string> }
  | {
      type: 'relation'
      id: number
      version: number
      members: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[]
      tags?: Record<string, string>
    }

const MEMBER_TYPE = { n: 'node', w: 'way', r: 'relation' } as const

/** OPL escapes special characters as %<hex codepoint>% */
function unescape(value: string) {
  return value.replace(/%([0-9a-fA-F]+)%/g, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  )
}

function parseTags(field: string) {
  if (!field) return undefined
  const tags: Record<string, string> = {}
  for (const pair of field.split(',')) {
    const eq = pair.indexOf('=')
    tags[unescape(pair.slice(0, eq))] = unescape(pair.slice(eq + 1))
  }
  return tags
}

export function parseOplLine(line: string): Element | undefined {
  if (!line) return undefined
  const fields = line.split(' ')
  const head = fields[0]!
  const id = Number(head.slice(1))
  let version = 1
  let tags: Record<string, string> | undefined
  let x = 0
  let y = 0
  let nodes: number[] = []
  let members: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[] = []
  for (const field of fields.slice(1)) {
    const value = field.slice(1)
    switch (field[0]) {
      case 'v':
        version = Number(value)
        break
      case 'T':
        tags = parseTags(value)
        break
      case 'x':
        x = Number(value)
        break
      case 'y':
        y = Number(value)
        break
      case 'N':
        nodes = value ? value.split(',').map((n) => Number(n.slice(1))) : []
        break
      case 'M':
        members = value
          ? value.split(',').map((m) => {
              const at = m.indexOf('@')
              return {
                type: MEMBER_TYPE[m[0] as 'n' | 'w' | 'r'],
                ref: Number(m.slice(1, at)),
                role: unescape(m.slice(at + 1)),
              }
            })
          : []
        break
      case undefined: {
        throw new Error('Not implemented yet: undefined case')
      }
      default:
        break // fields we do not need: changeset, timestamp, user
    }
  }
  switch (head[0]) {
    case 'n':
      return { type: 'node', id, lat: y, lon: x, version, ...(tags && { tags }) }
    case 'w':
      return { type: 'way', id, version, nodes, ...(tags && { tags }) }
    case 'r':
      return { type: 'relation', id, version, members, ...(tags && { tags }) }
    case undefined: {
      throw new Error('Not implemented yet: undefined case')
    }
    default:
      return undefined
  }
}

/**
 * The command line: the first argument without a flag is the extract; `--scene name[,name]`
 * (repeatable) picks scenes, and without it every scene in SCENES is built. An unknown scene
 * name throws, and the error lists the known names.
 */
export function parseBuildArgs(argv: string[]): { source: string | undefined; scenes: Scene[] } {
  const names: string[] = []
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--scene') {
      const value = argv[++i]
      if (!value) throw new Error('--scene needs a scene name')
      names.push(...value.split(','))
    } else if (arg.startsWith('--scene=')) {
      names.push(...arg.slice('--scene='.length).split(','))
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  const scenes = names.length ? [...new Set(names)].map((name) => getScene(name)) : SCENES
  return { source: positional[0], scenes }
}

if (import.meta.main) {
  let parsed: ReturnType<typeof parseBuildArgs>
  try {
    parsed = parseBuildArgs(process.argv.slice(2))
  } catch (error) {
    console.error((error as Error).message)
    process.exit(1)
  }
  const { source, scenes } = parsed
  if (!source) {
    console.error('Usage: bun run fixtures-build /path/to/extract.osm.pbf [--scene name[,name]]')
    process.exit(1)
  }
  const outDir = join(import.meta.dir, '../../fixtures')
  mkdirSync(outDir, { recursive: true })
  const info = await $`osmium fileinfo ${source}`.text()
  const sourceTimestamp = info.match(/timestamp=(\S+)/)?.[1] ?? 'unknown'
  const osmiumVersion = (await $`osmium --version`.text()).split('\n')[0]

  for (const scene of scenes) {
    const pbf = join(outDir, `${scene.name}.tmp.osm.pbf`)
    await $`osmium extract -b ${scene.bbox.join(',')} -s complete_ways -O -o ${pbf} ${source}`.quiet()
    const opl = await $`osmium cat -f opl ${pbf}`.quiet().text()
    await $`rm ${pbf}`
    const elements = opl
      .split('\n')
      .map(parseOplLine)
      .filter((e) => e !== undefined)
    const counts = { node: 0, way: 0, relation: 0 }
    for (const e of elements) counts[e.type]++
    const json = JSON.stringify({ version: '0.6', generator: 'maid fixtures', elements })
    await Bun.write(join(outDir, `${scene.name}.json.gz`), Bun.gzipSync(Buffer.from(json)))
    const meta = {
      ...scene,
      counts,
      source: { file: source.split('/').pop(), timestamp: sourceTimestamp, osmium: osmiumVersion },
      attribution: '© OpenStreetMap contributors, ODbL 1.0',
      sha256: new Bun.CryptoHasher('sha256').update(json).digest('hex'),
    }
    await Bun.write(join(outDir, `${scene.name}.meta.json`), JSON.stringify(meta, null, 2) + '\n')
    console.log(
      `${scene.name}: ${counts.node} nodes, ${counts.way} ways, ${counts.relation} relations`,
    )
  }
  console.log(`Wrote fixtures to ${outDir}`)
}
