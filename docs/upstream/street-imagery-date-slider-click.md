# Draft: a click on the date slider moves the nearest handle

For `@osm-editor-kit/street-imagery-react`, `PhotoDateRangeFilter` (`packages/street-imagery-react/src/filters/PhotoDateRangeFilter.tsx`). Draft only: Tobias applies it in the package's repository.

## What Tobias wants

A click on the chart or on the track of the "Taken between" slider moves a handle to that place. It should move the handle that is nearer to the click, as other range sliders do. Today only the two handles take the pointer: both range inputs use `pointer-events-none` (`HANDLE_CLASS`), and only their thumbs get pointer events back. A click beside a handle does nothing.

## Proposed change

The chart (`<div className="relative" style={{ height: CHART_HEIGHT_PX … }}>`) and the track (`<div className="relative h-4">`) sit in one wrapper. That wrapper gets a pointer handler. The handler turns the click's x into a slider position from 0 to 1. It moves the nearer handle there and commits it, the same way a released handle commits.

```tsx
// a click on the chart or the track moves the nearer handle there; a press on a handle is the handle's own drag
const moveNearest = (event: React.PointerEvent<HTMLDivElement>) => {
  if (event.target instanceof HTMLInputElement) return
  const box = event.currentTarget.getBoundingClientRect()
  // the track is inset by mx-2 (8 px) on both sides, as the chart is
  const inset = 8
  const at = Math.min(1, Math.max(0, (event.clientX - box.left - inset) / (box.width - 2 * inset)))
  const moved = Math.abs(at - positions.from) <= Math.abs(at - positions.to) ? 'from' : 'to'
  const next = moved === 'from' ? { from: Math.min(at, positions.to), to: positions.to } : { from: positions.from, to: Math.max(at, positions.from) }
  const range = sliderPositionsToDateRange(next, scale)
  const other = moved === 'from' ? 'to' : 'from'
  onChange({ ...range, [other]: value[other] })
}
```

- Wrap the chart and the track in `<div onPointerDown={moveNearest} className="cursor-pointer">`.
- When both handles are equally far away, the `from` handle moves (`<=`). That matches a click left of the range moving the start.
- Keyboard use is unchanged: the range inputs stay as they are.
- Test (Vitest, Testing Library): render with `value = { from: 3 years ago }`. A pointer-down at 90 % of the width moves `to`. One at 10 % moves `from`. One on a thumb changes nothing.

## Also seen

The year labels under the track ("4 J.", "3 J.", …) already set "since N years" with a click (`setYears`). This change does not touch them.
