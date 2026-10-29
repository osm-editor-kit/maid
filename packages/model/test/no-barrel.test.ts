// Guards the import rule for @rapid-sdk/util: the barrel (`from '@rapid-sdk/util'`) re-exports aes-js, which
// then lands in the app's start chunk. Import each function from its subpath instead, e.g.
// `from '@rapid-sdk/util/array'`. The subpaths are added by patches/@rapid-sdk%2Futil@1.0.0-pre.5.patch.
import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const BARREL = /(?:\bfrom\s+|\bimport\(\s*|\brequire\(\s*)['"]@rapid-sdk\/util['"]/
const BARREL_ALL = new RegExp(BARREL.source, 'g')
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const EXTENSIONS = /\.(ts|tsx|mts|js|jsx|mjs)$/

function walk(dir: string, out: string[]): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path, out)
        else if (EXTENSIONS.test(name)) out.push(path)
    }
    return out
}

// packages/*/src and apps/*/src
function sourceFiles(): string[] {
    const files: string[] = []
    for (const parent of ['packages', 'apps']) {
        for (const name of readdirSync(join(ROOT, parent))) {
            const src = join(ROOT, parent, name, 'src')
            try {
                if (statSync(src).isDirectory()) walk(src, files)
            } catch {
                // not every package or app has a src folder
            }
        }
    }
    return files
}

describe('@rapid-sdk/util is imported by subpath, never by the barrel', () => {
    it('the pattern matches the barrel and not the subpaths', () => {
        expect(BARREL.test(`import { x } from '@rapid-sdk/util'`)).toBe(true)
        expect(BARREL.test(`import { x } from "@rapid-sdk/util"`)).toBe(true)
        expect(BARREL.test(`import { x } from '@rapid-sdk/util/array'`)).toBe(false)
        expect(BARREL.test(`import { x } from '@rapid-sdk/math'`)).toBe(false)
    })

    it('no source file in packages/*/src or apps/*/src imports the barrel', () => {
        const files = sourceFiles().map((f) => relative(ROOT, f).split('\\').join('/'))
        // the scan itself must see the model's sources, or an empty scan would pass silently
        expect(files).toContain('packages/model/src/actions/move.ts')

        const offenders: string[] = []
        for (const file of files) {
            const text = readFileSync(join(ROOT, file), 'utf8')
            for (const match of text.matchAll(BARREL_ALL)) {
                const line = text.slice(0, match.index).split('\n').length
                offenders.push(
                    `${file}:${line}: imports the @rapid-sdk/util barrel. It pulls aes-js into the start chunk. ` +
                        `Import the function from its subpath instead, e.g. from '@rapid-sdk/util/array' ` +
                        `(also '/object', '/string', '/osm').`,
                )
            }
        }
        expect(offenders.join('\n')).toBe('')
    })
})
