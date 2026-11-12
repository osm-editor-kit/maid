/**
 * Climbing grades and styles as OSM tags them: `climbing:grade:<system>` and `climbing:<style>=yes`. Pure.
 *
 * Several systems may be tagged on one route. The one shown is the first in GRADE_SYSTEMS that is present, a fixed
 * order (OpenClimbing takes the first tag in the order the tags happen to have, which changes with an edit). No grade is
 * converted here: the conversion tables differ between sources (docs/research/climbing.md, "Grades").
 */
export type GradeSystem = { key: string; label: string }

/** The systems of the tagging schema (main and PR 2793), the common European ones first */
export const GRADE_SYSTEMS: readonly GradeSystem[] = [
  { key: 'climbing:grade:uiaa', label: 'UIAA' },
  { key: 'climbing:grade:french', label: 'French' },
  { key: 'climbing:grade:saxon', label: 'Saxon' },
  { key: 'climbing:grade:yds_class', label: 'YDS' },
  { key: 'climbing:grade:hueco', label: 'Hueco' },
  { key: 'climbing:grade:ice', label: 'WI' },
  { key: 'climbing:grade:mixed', label: 'Mixed' },
  { key: 'climbing:grade:dry', label: 'Dry' },
  { key: 'climbing:grade:aid', label: 'Aid' },
]

export type Grade = { value: string; system: string }

/** The grade a route shows: the first system in GRADE_SYSTEMS that has a value, else a bare `climbing:grade` */
export function gradeOf(tags: Readonly<Record<string, string>>): Grade | undefined {
  for (const system of GRADE_SYSTEMS) {
    const value = tags[system.key]?.trim()
    if (value) return { value, system: system.label }
  }
  const bare = tags['climbing:grade']?.trim()
  return bare ? { value: bare, system: '' } : undefined
}

/** The styles of OSM's `climbing:<style>=yes`, in the order the section names them */
export const STYLES = [
  'sport',
  'trad',
  'boulder',
  'multipitch',
  'ice',
  'mixed',
  'dry',
  'aid',
] as const
export type Style = (typeof STYLES)[number]

export function stylesOf(tags: Readonly<Record<string, string>>): Style[] {
  return STYLES.filter((style) => tags[`climbing:${style}`] === 'yes')
}

/**
 * A rough difficulty band 1 (easy) to 5 (hard) for colour, from UIAA or French only; undefined for the rest. UIAA
 * 1–4 and French 1–4: 1; UIAA 5, French 5: 2; UIAA 6, French 6a–6b: 3; UIAA 7–8, French 6c–7b: 4; harder: 5.
 */
export function difficultyBand(tags: Readonly<Record<string, string>>): number | undefined {
  const uiaa = tags['climbing:grade:uiaa']?.match(/^(\d+)/)
  if (uiaa) {
    const n = Number(uiaa[1])
    if (n <= 4) return 1
    if (n === 5) return 2
    if (n === 6) return 3
    if (n <= 8) return 4
    return 5
  }
  const french = tags['climbing:grade:french']?.match(/^(\d)([abc])?/)
  if (french) {
    const n = Number(french[1])
    const letter = french[2] ?? 'a'
    if (n <= 4) return 1
    if (n === 5) return 2
    if (n === 6) return letter === 'c' ? 4 : 3
    if (n === 7) return letter === 'c' ? 5 : 4
    return 5
  }
  return undefined
}
