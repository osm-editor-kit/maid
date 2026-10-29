import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spriteOf } from '../../packages/shell/src/sprite-sets.ts'
import { iconNames, KNOWN_MISSING } from './icon-names.ts'
import { cutSprite, SPRITE_SETS, SUBSET_DIR } from './subset-sprites.ts'

/** The ids of the symbols in a sprite file */
function symbolIds(text: string) {
  return new Set([...text.matchAll(/<symbol\b[^>]*?\sid="([^"]+)"/g)].map((m) => m[1]!))
}

describe('the subset icon sprites', () => {
  it('hold every icon that the presets, the modules and the code can show', async () => {
    const { uses } = await iconNames()
    const ids = new Map<string, Set<string>>(
      SPRITE_SETS.map((set) => [
        set,
        symbolIds(readFileSync(join(SUBSET_DIR, `${set}-sprite.svg`), 'utf8')),
      ]),
    )
    const missing: string[] = []
    for (const [name, sources] of uses) {
      if (KNOWN_MISSING[name] !== undefined) continue
      const set = spriteOf(name)
      if (set === undefined || !ids.get(set)?.has(name)) {
        missing.push(
          `${name} (${set ?? 'no sprite'}-sprite.svg, used by ${sources.slice(0, 3).join(', ')})`,
        )
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} icons are missing from ${SUBSET_DIR}. Run bun run sprites-subset if iD has them; otherwise fix the name:\n  ${missing.join('\n  ')}`,
      )
    }
  })
})

describe('cutSprite', () => {
  const source = [
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">',
    '<defs><pattern id="p1"><path/></pattern><pattern id="p2"><path/></pattern></defs>',
    '<symbol viewBox="0 0 1 1" id="a"><path fill="url(#p1)"/></symbol>',
    '<symbol viewBox="0 0 1 1" id="b"><path/></symbol>',
    '<symbol viewBox="0 0 1 1" id="c"><use xlink:href="#b"/></symbol>',
    '</svg>',
  ].join('')

  it('keeps the used symbols and the whole <defs> block they reference, and drops the rest', () => {
    const cut = cutSprite(source, new Set(['a']))
    expect(cut.keptSymbols).toEqual(['a'])
    expect(cut.keptDefs).toBe(1)
    // the block is kept whole, so p2 comes along with p1; the symbols b and c are not used and go
    expect(cut.text).toBe(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="p1"><path/></pattern><pattern id="p2"><path/></pattern></defs><symbol viewBox="0 0 1 1" id="a"><path fill="url(#p1)"/></symbol></svg>',
    )
    expect(cut.missing).toEqual([])
  })

  it('keeps a symbol that another kept symbol uses, and reports a name the sprite lacks', () => {
    const cut = cutSprite(source, new Set(['c', 'zzz']))
    expect(cut.keptSymbols).toEqual(['b', 'c'])
    expect(cut.missing).toEqual(['zzz'])
  })
})
