import { describe, expect, test } from 'bun:test'
import {
  COMPLETION_STATUSES,
  MAPPER_STATUSES,
  TaskStatus,
  isOpen,
  isRecentlyResolved,
  isResolved,
  shouldDisplay,
  statusName,
  statusOf,
} from './status.ts'

const now = Date.parse('2026-11-13T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString()

describe('status numbers and names', () => {
  test('numbers match the API', () => {
    expect(TaskStatus).toEqual({
      Created: 0,
      Fixed: 1,
      FalsePositive: 2,
      Skipped: 3,
      Deleted: 4,
      AlreadyFixed: 5,
      TooHard: 6,
      Disabled: 9,
    })
    expect(statusName(5)).toBe('Already fixed')
    expect(statusName(9)).toBe('Disabled')
    expect(statusName(42)).toBe('42')
  })

  test('mapper statuses and completion statuses', () => {
    expect([...MAPPER_STATUSES]).toEqual([1, 2, 3, 5, 6])
    expect([...COMPLETION_STATUSES]).toEqual([1, 5, 2, 6])
  })
})

describe('open and resolved', () => {
  test('a task without status is created, hence open', () => {
    expect(statusOf({})).toBe(0)
    expect(statusOf(null)).toBe(0)
    expect(isOpen({})).toBe(true)
  })

  test('open is Created or Skipped; resolved is Fixed, False positive, Already fixed, Too hard', () => {
    for (const s of [0, 3]) expect(isOpen({ status: s })).toBe(true)
    for (const s of [1, 2, 4, 5, 6, 9]) expect(isOpen({ status: s })).toBe(false)
    for (const s of [1, 2, 5, 6]) expect(isResolved({ status: s })).toBe(true)
    for (const s of [0, 3, 4, 9]) expect(isResolved({ status: s })).toBe(false)
  })
})

describe('isRecentlyResolved', () => {
  test('resolved less than 24 hours ago', () => {
    expect(isRecentlyResolved({ status: 1, mappedOn: hoursAgo(23) }, now)).toBe(true)
    expect(isRecentlyResolved({ status: 1, mappedOn: hoursAgo(25) }, now)).toBe(false)
    expect(isRecentlyResolved({ status: 1, mappedOn: hoursAgo(24) }, now)).toBe(false)
  })

  test('accepts a Date for now', () => {
    expect(isRecentlyResolved({ status: 5, mappedOn: hoursAgo(1) }, new Date(now))).toBe(true)
  })

  test('open tasks, a missing or a broken mappedOn are not recently resolved', () => {
    expect(isRecentlyResolved({ status: 0, mappedOn: hoursAgo(1) }, now)).toBe(false)
    expect(isRecentlyResolved({ status: 1 }, now)).toBe(false)
    expect(isRecentlyResolved({ status: 1, mappedOn: 'yesterday' }, now)).toBe(false)
  })

  test('shouldDisplay: open, or recently resolved', () => {
    expect(shouldDisplay({ status: 3 }, now)).toBe(true)
    expect(shouldDisplay({ status: 2, mappedOn: hoursAgo(2) }, now)).toBe(true)
    expect(shouldDisplay({ status: 2, mappedOn: hoursAgo(48) }, now)).toBe(false)
    expect(shouldDisplay(null, now)).toBe(false)
  })
})
