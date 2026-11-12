/**
 * The colours of the photos on the map: by age (the package's steps: older than 4 years, 2 to 4 years, newer than 2
 * years) or by type (flat, 360°). Pure: no React, no store.
 */
import {
  ageStepColorExpression,
  createAgeSteps,
  PHOTO_TYPE_COLORS,
  photoTypeColorExpression,
  type AgeStep,
} from '@osm-editor-kit/street-imagery'
import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl'
import type { ColorMode } from './state.ts'

/**
 * The time the steps are measured from: the page's start, fixed for its lifetime so the paint of the map stays the
 * same (the package's advice for `createAgeSteps`).
 */
export const AGE_NOW = Date.now()

/** The age steps, oldest first (ids `old`, `mid`, `current`), from the package's defaults: 4 and 2 years */
export const AGE_STEPS: readonly AgeStep[] = createAgeSteps({ now: AGE_NOW })

/** The colour of a photo without a date, in both modes */
export const UNKNOWN_COLOR = '#9ca3af'

/** The step of a capture time (ms), or null for a photo without a date (the package's rule, not exported by it) */
export function ageStepOf(capturedAt: number | null): AgeStep | null {
  if (capturedAt === null || Number.isNaN(capturedAt)) return null
  return (
    AGE_STEPS.find(
      (step) =>
        (step.from === null || capturedAt >= step.from) &&
        (step.to === null || capturedAt < step.to),
    ) ?? null
  )
}

const AGE_EXPRESSION = ageStepColorExpression(AGE_STEPS, {
  unknownColor: UNKNOWN_COLOR,
}) as DataDrivenPropertyValueSpecification<string>

/** The MapLibre colour of a photo (`photoCircleColor` of the package's layers) */
export function photoColorExpression(
  mode: ColorMode,
): DataDrivenPropertyValueSpecification<string> {
  return mode === 'age' ? AGE_EXPRESSION : photoTypeColorExpression
}

/** One entry of the legend: an id for its text, its colour and how many photos in view have it */
export type LegendEntry = { id: string; color: string; count: number }

type LegendPhoto = { capturedAt: number | null; isPano: boolean | null }

/**
 * The legend of a mode with the number of photos in view per entry, newest or 360° first. The entry for photos
 * without a date (or type) is left out while no photo has it.
 */
export function legendEntries(mode: ColorMode, photos: readonly LegendPhoto[]): LegendEntry[] {
  if (mode === 'type') {
    const count = (isPano: boolean | null) =>
      photos.filter((photo) => photo.isPano === isPano).length
    return [
      { id: 'pano', color: PHOTO_TYPE_COLORS.panorama, count: count(true) },
      { id: 'flat', color: PHOTO_TYPE_COLORS.flat, count: count(false) },
      { id: 'unknown', color: PHOTO_TYPE_COLORS.unknown, count: count(null) },
    ].filter((entry) => entry.id !== 'unknown' || entry.count > 0)
  }
  const counts = new Map<string, number>()
  for (const photo of photos) {
    const id = ageStepOf(photo.capturedAt)?.id ?? 'unknown'
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [
    ...[...AGE_STEPS].reverse().map((step) => ({
      id: step.id,
      color: step.color,
      count: counts.get(step.id) ?? 0,
    })),
    { id: 'unknown', color: UNKNOWN_COLOR, count: counts.get('unknown') ?? 0 },
  ].filter((entry) => entry.id !== 'unknown' || entry.count > 0)
}
