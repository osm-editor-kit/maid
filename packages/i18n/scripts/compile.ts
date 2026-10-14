/**
 * Generates Paraglide's output into `paraglide/` for every inlang project (projects.ts): the app's texts in
 * packages/i18n and each module's own texts in packages/module-*. Each project reads `project.inlang/settings.json`
 * and `messages/`. Run by `bun run i18n-compile` and by every script that needs the output (the root package.json).
 *
 * It does nothing for a project whose output is newer than its inputs, so scripts that run one after another
 * compile once, and two scripts that start together do not write the same folder at the same time.
 *
 *   bun run --cwd packages/i18n compile          (add --force to compile in any case)
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PARAGLIDE_CLI, PROJECTS, type Project } from './projects.ts'

// Paraglide does not rewrite files whose content is unchanged, so their times do not tell when it ran.
// This file is written after each successful compile, and it is inside the output folder.
const stampOf = (project: Project) => join(project.dir, 'paraglide', '.compiled')

function newestInput(project: Project): number {
  const messages = join(project.dir, 'messages')
  const inputs = [
    join(project.dir, 'project.inlang/settings.json'),
    join(import.meta.dir, 'compile.ts'),
    join(import.meta.dir, 'projects.ts'),
    ...readdirSync(messages).map((file) => join(messages, file)),
  ]
  return Math.max(...inputs.map((file) => statSync(file).mtimeMs))
}

function isFresh(project: Project): boolean {
  try {
    return statSync(stampOf(project)).mtimeMs >= newestInput(project)
  } catch {
    // no output yet: compile
    return false
  }
}

function compile(project: Project): boolean {
  if (!process.argv.includes('--force') && isFresh(project)) {
    console.log(`i18n: ${project.name}/paraglide is up to date`)
    return true
  }
  const result = spawnSync(
    process.execPath,
    [
      PARAGLIDE_CLI,
      'compile',
      '--project',
      './project.inlang',
      '--outdir',
      './paraglide',
      '--emit-ts-declarations',
      '--strategy',
      ...project.strategy,
    ],
    { cwd: project.dir, stdio: 'inherit' },
  )
  if (result.status !== 0) {
    console.error(`i18n: paraglide-js compile failed in ${project.name}`)
    return false
  }
  mkdirSync(join(project.dir, 'paraglide'), { recursive: true })
  writeFileSync(stampOf(project), `${new Date().toISOString()}\n`)
  console.log(`i18n: compiled ${project.name} into ${join(project.dir, 'paraglide')}`)
  return true
}

const failed = PROJECTS.filter((project) => !compile(project))
if (failed.length) process.exit(1)
