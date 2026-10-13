import type { FieldComponent, FieldProps } from '@osm-editor-kit/maid-ui'
import { INPUT_CLASS, PLAIN_INPUT, writeEdits } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { applyEdits, readSide, sideKey, writeSide, type RealSide, type TagEdit } from '../sides.ts'
import {
  addRange,
  conditionFromEditor,
  editorFromCondition,
  monthEnds,
  monthsAllowed,
  removeRange,
  setMonthEdge,
  setRangeEdge,
  toggleDay,
  type EditorState,
} from './condition-editor.ts'
import { MONTHS, WEEKDAYS } from './condition.ts'
import {
  addRule,
  blocksCommit,
  conditionalKeyOf,
  conditionText,
  draftFromTags,
  planCommit,
  removeRule,
  ruleIssues,
  setPlain,
  setRaw,
  setRuleCondition,
  setRuleValue,
  type FieldDraft,
  type RuleDraft,
  type RuleIssue,
} from './field-logic.ts'
import { restrictionLabels, type RestrictionLabels } from './labels.ts'

/** The field type the module registers on `inspector.field`; a preset field with this `type` uses RestrictionField */
export const PARKING_RESTRICTION_FIELD_TYPE = 'parkingRestriction'

/** What one editor shows and writes: a plain value and the text of its `:conditional` sibling */
type Stored = { plain: string; text: string }

type Tags = Readonly<Record<string, string | undefined>>

/** The keys the features differ on are mixed: the editor then shows "Multiple values" for an empty value */
function isMixed(props: FieldProps, key: string): boolean {
  return props.combined?.[key]?.kind === 'mixed'
}

/**
 * The values the field offers, for the plain key and for a rule alike: the options of the preset field (for the
 * restriction the four of the project's presets, presets/fields.ts). None: free text.
 */
function valuesOf(props: FieldProps): readonly string[] | undefined {
  const values = props.field.options.map((option) => option.value)
  return values.length > 0 ? values : undefined
}

/**
 * A plain key and its `:conditional` sibling as one field. The field's key is the plain key; the rules are written to
 * `<key>:conditional` in the same change.
 */
const ConditionalField: FieldComponent = (props) => {
  const key = props.field.key
  if (key === undefined) return null
  const condKey = conditionalKeyOf(key)
  return (
    <ConditionalEditor
      tagKey={key}
      id={props.id}
      stored={{ plain: props.tags[key] ?? '', text: props.tags[condKey] ?? '' }}
      mixed={isMixed(props, key) || isMixed(props, condKey)}
      values={valuesOf(props)}
      linesFor={(wanted) => linesOf({ [key]: wanted.plain, [condKey]: wanted.text })}
      onWrite={props.onChange ? (edits) => writeEdits(props, edits) : undefined}
    />
  )
}

/** The tags as `key=value` lines, without the empty ones */
function linesOf(tags: Tags): string[] {
  return Object.entries(tags).flatMap(([key, value]) => (value ? [`${key}=${value}`] : []))
}

/** `restriction` of `parking:both:restriction`: what follows the side, or undefined when the key is no side key */
function sideSuffixOf(key: string | undefined): string | undefined {
  return key?.match(/^parking:(?:left|right|both):(.+)$/)?.[1]
}

/**
 * The parking restriction field. On a side key (`parking:both:restriction`, as the road presets have it) it shows the
 * two sides of the road, left and right, each with its plain value and its conditional rules: the same two rows as the
 * inspector's other side fields, and as iD's. `both` is not a third block: a side shows the `both` value when it has
 * none of its own, and equal sides are written as `both` (`writeSide`, sides.ts). On any other key (`restriction` of a
 * parking area) it is the plain field for that one key.
 */
export const RestrictionField: FieldComponent = (props) => {
  const suffix = sideSuffixOf(props.field.key)
  if (suffix === undefined) return <ConditionalField {...props} />
  return <SidesRestriction {...props} suffix={suffix} />
}

const REAL_SIDES: readonly RealSide[] = ['left', 'right']

/** The value all features have for a side, or undefined with `mixed` when they differ */
function sharedSideValue(features: readonly Tags[], side: RealSide, suffix: string) {
  const values = new Set(features.map((tags) => readSide(tags, side, suffix) ?? ''))
  return values.size === 1
    ? { value: [...values][0] ?? '', mixed: false }
    : { value: '', mixed: true }
}

function SidesRestriction(props: FieldProps & { suffix: string }) {
  const { suffix, tags, features, id } = props
  const labels = restrictionLabels()
  const conditional = conditionalKeyOf(suffix)
  return (
    <div className="grid min-w-0 gap-3">
      {REAL_SIDES.map((side) => {
        const key = sideKey(side, suffix)
        const condKey = sideKey(side, conditional)
        // several features: what they share, each read with its own `both`; one feature: its tags
        const plain = sharedSideValue(features ?? [tags], side, suffix)
        const text = sharedSideValue(features ?? [tags], side, conditional)
        /**
         * The edits for changes of this side's two keys. One feature: through `writeSide`, so the other side keeps
         * its value and equal sides become `both`. Several features: this side's own keys as they are, on all of
         * them, as the directional fields do (the other side of each feature is not in the shared tags).
         */
        const editsFor = (changes: readonly TagEdit[]): TagEdit[] => {
          if (features !== undefined) return [...changes]
          let work = applyEdits(tags, [])
          const edits: TagEdit[] = []
          for (const change of changes) {
            const written = writeSide(
              work,
              side,
              change.key === key ? suffix : conditional,
              change.value,
            )
            work = applyEdits(work, written)
            edits.push(...written)
          }
          return edits
        }
        /** The lines that hold this side's values after the write: its own keys, or the `both` keys */
        const linesFor = (wanted: Stored) => {
          const after = applyEdits(
            tags,
            editsFor([
              { key, value: wanted.plain || undefined },
              { key: condKey, value: wanted.text || undefined },
            ]),
          )
          return [suffix, conditional].flatMap((rest) => {
            const held = [sideKey(side, rest), sideKey('both', rest)].find((name) => after[name])
            return held ? [`${held}=${after[held]}`] : []
          })
        }
        return (
          <div
            key={side}
            role="group"
            aria-label={labels.sides[side]}
            className="grid min-w-0 gap-1"
          >
            <span className={HINT}>{labels.sides[side]}</span>
            <ConditionalEditor
              tagKey={key}
              id={side === 'left' ? id : undefined}
              stored={{ plain: plain.value, text: text.value }}
              mixed={plain.mixed || text.mixed}
              values={valuesOf(props)}
              linesFor={linesFor}
              onWrite={
                props.onChange ? (changes) => writeEdits(props, editsFor(changes)) : undefined
              }
            />
          </div>
        )
      })}
    </div>
  )
}

const LIMIT = 255
const HINT = 'min-w-0 text-xs text-zinc-500 dark:text-zinc-400'
const CHIP =
  'h-6 min-w-8 rounded border border-zinc-950/10 px-1.5 text-xs text-zinc-700 hover:bg-zinc-950/5 aria-pressed:border-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10'
const BUTTON =
  'h-6 shrink-0 rounded px-2 text-xs text-zinc-700 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10'

type EditorProps = {
  /** The plain key: the map shows its side while the editor has the focus (`data-focus-key`) */
  tagKey: string
  id: string | undefined
  /** The values as the tags have them now */
  stored: Stored
  mixed: boolean
  /** The list for the plain value and for a rule's value; absent: free text */
  values: readonly string[] | undefined
  /** The tag lines the values would be written as, for the preview */
  linesFor: (wanted: Stored) => string[]
  /** Writes the changed ones of the two keys as one change. Absent: read-only. */
  onWrite: ((changes: TagEdit[]) => void) | undefined
}

/**
 * The editor keeps its draft while it is mounted: rows that are not finished, a row's "Edit as text" choice and the
 * focus survive a write. The draft starts over from the tags only when they change to something the draft did not
 * write (undo, the tag sheet, a button).
 */
function ConditionalEditor({ tagKey, id, stored, mixed, values, linesFor, onWrite }: EditorProps) {
  const labels = restrictionLabels()
  const condKey = conditionalKeyOf(tagKey)
  const storedTags = { [tagKey]: stored.plain, [condKey]: stored.text }
  const [state, setState] = useState(() => ({ stored, draft: draftFromTags(tagKey, storedTags) }))
  let draft = state.draft
  if (state.stored.plain !== stored.plain || state.stored.text !== stored.text) {
    // the tags changed: keep the draft when they now say what it writes, else start over from them
    const plan = planCommit(draft, tagKey, storedTags)
    if (!plan.ok || plan.changes.length > 0) draft = draftFromTags(tagKey, storedTags)
    setState({ stored, draft })
  }
  const readOnly = onWrite === undefined
  const issues = ruleIssues(draft)
  const blocked = issues.some((found) => blocksCommit(found.issue))
  const wanted: Stored = { plain: draft.plain.trim(), text: conditionText(draft) }
  const lines = linesFor(wanted)

  // Every change of the draft is kept; the tags are written when nothing blocks it, both keys as one change
  const commit = (next: FieldDraft) => {
    setState({ stored: state.stored, draft: next })
    if (!onWrite) return
    const plan = planCommit(next, tagKey, storedTags)
    if (!plan.ok || plan.changes.length === 0) return
    onWrite(plan.changes)
  }

  return (
    <div data-focus-key={tagKey} className="grid min-w-0 gap-2">
      <PlainValue
        id={id}
        value={draft.plain}
        values={values}
        mixed={mixed}
        readOnly={readOnly}
        labels={labels}
        onCommit={(plain) => commit(setPlain(draft, plain))}
      />
      {draft.raw !== undefined ? (
        <DraftText
          key={draft.raw}
          ariaLabel={labels.condition}
          value={draft.raw}
          readOnly={readOnly}
          invalid
          className="w-full"
          onCommit={(raw) => commit(setRaw(draft, raw))}
        />
      ) : (
        <div className="grid min-w-0 gap-2">
          <span className={HINT}>{labels.conditionalRules}</span>
          {draft.rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              issue={issues.find((found) => found.id === rule.id)?.issue}
              ruleValues={values}
              readOnly={readOnly}
              labels={labels}
              onValue={(value) => commit(setRuleValue(draft, rule.id, value))}
              onCondition={(condition) => commit(setRuleCondition(draft, rule.id, condition))}
              onRemove={() => commit(removeRule(draft, rule.id))}
            />
          ))}
          <div>
            <button
              type="button"
              className={BUTTON}
              disabled={readOnly}
              onClick={() => commit(addRule(draft))}
            >
              {labels.addRule}
            </button>
          </div>
        </div>
      )}
      <div className="grid min-w-0 gap-1">
        <span className={HINT}>{labels.preview}</span>
        <pre className="overflow-x-auto rounded bg-zinc-950/5 px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-zinc-800 dark:bg-white/5 dark:text-zinc-200">
          {lines.length > 0 ? lines.join('\n') : '—'}
        </pre>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className={blocked ? 'text-red-600 dark:text-red-400' : HINT}>
            {blocked ? labels.notWritten : ''}
          </span>
          <LengthCount length={Array.from(wanted.text).length} />
        </div>
        {issues
          .filter((issue) => issue.id === undefined)
          .map((issue) => (
            <p key={issue.issue} className="text-xs text-red-600 dark:text-red-400">
              {issueText(labels, issue.issue)}
            </p>
          ))}
      </div>
    </div>
  )
}

/** The counter from 10 characters before the limit, as the text fields show it; red over the limit */
function LengthCount({ length }: { length: number }) {
  if (length < LIMIT - 10) return null
  return (
    <span className={`tabular-nums ${length > LIMIT ? 'text-red-600 dark:text-red-400' : HINT}`}>
      {length} / {LIMIT}
    </span>
  )
}

function issueText(labels: RestrictionLabels, issue: RuleIssue): string {
  switch (issue) {
    case 'no-value':
      return labels.issueNoValue
    case 'no-condition':
      return labels.issueNoCondition
    case 'bad-value':
      return labels.issueBadValue
    case 'bad-condition':
      return labels.issueBadCondition
    case 'bad-rules':
      return labels.issueBadRules
  }
}

function PlainValue(props: {
  id: string | undefined
  value: string
  values: readonly string[] | undefined
  mixed: boolean
  readOnly: boolean
  labels: RestrictionLabels
  onCommit: (value: string) => void
}) {
  const { id, value, values, mixed, readOnly, labels, onCommit } = props
  if (values === undefined) {
    return (
      <DraftText
        key={value}
        id={id}
        ariaLabel={labels.value}
        value={value}
        readOnly={readOnly}
        placeholder={mixed ? labels.multiple : labels.notSet}
        className="w-full"
        onCommit={onCommit}
      />
    )
  }
  // a value the list does not name stays in the list, so that it is not lost by a choice
  const choices = value === '' || values.includes(value) ? values : [value, ...values]
  return (
    <select
      id={id}
      className={INPUT_CLASS}
      value={value}
      disabled={readOnly}
      onChange={(event) => onCommit(event.target.value)}
    >
      <option value="">{mixed ? labels.multiple : labels.notSet}</option>
      {choices.map((choice) => (
        <option key={choice} value={choice}>
          {labels.values[choice] ?? choice}
        </option>
      ))}
    </select>
  )
}

function RuleRow(props: {
  rule: RuleDraft
  issue: RuleIssue | undefined
  ruleValues: readonly string[] | undefined
  readOnly: boolean
  labels: RestrictionLabels
  onValue: (value: string) => void
  onCondition: (condition: string) => void
  onRemove: () => void
}) {
  const { rule, issue, ruleValues, readOnly, labels, onValue, onCondition, onRemove } = props
  const editor = editorFromCondition(rule.condition)
  const [asText, setAsText] = useState(false)
  const textMode = editor === undefined || asText
  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-zinc-950/10 p-2 dark:border-white/10">
      <div className="flex min-w-0 items-center gap-1.5">
        <RuleValue
          value={rule.value}
          ruleValues={ruleValues}
          readOnly={readOnly}
          labels={labels}
          onCommit={onValue}
        />
        {editor !== undefined ? (
          <button
            type="button"
            className={BUTTON}
            disabled={readOnly}
            onClick={() => setAsText(!asText)}
          >
            {textMode ? labels.useFields : labels.editAsText}
          </button>
        ) : null}
        <button type="button" className={BUTTON} disabled={readOnly} onClick={onRemove}>
          {labels.removeRule}
        </button>
      </div>
      {textMode ? (
        <>
          {editor === undefined ? <span className={HINT}>{labels.notStructured}</span> : null}
          <DraftText
            key={rule.condition}
            ariaLabel={labels.condition}
            value={rule.condition}
            readOnly={readOnly}
            placeholder="Mo-Fr 08:00-18:00"
            className="w-full"
            onCommit={onCondition}
          />
        </>
      ) : (
        <ConditionEditor
          state={editor}
          readOnly={readOnly}
          labels={labels}
          onChange={(next) => onCondition(conditionFromEditor(next))}
        />
      )}
      {issue !== undefined ? (
        <p className={blocksCommit(issue) ? 'text-xs text-red-600 dark:text-red-400' : HINT}>
          {issueText(labels, issue)}
        </p>
      ) : null}
    </div>
  )
}

function RuleValue(props: {
  value: string
  ruleValues: readonly string[] | undefined
  readOnly: boolean
  labels: RestrictionLabels
  onCommit: (value: string) => void
}) {
  const { value, ruleValues, readOnly, labels, onCommit } = props
  if (ruleValues === undefined) {
    return (
      <DraftText
        key={value}
        ariaLabel={labels.value}
        value={value}
        readOnly={readOnly}
        placeholder={labels.chooseValue}
        className="min-w-0 flex-1"
        onCommit={onCommit}
      />
    )
  }
  const choices = value === '' || ruleValues.includes(value) ? ruleValues : [value, ...ruleValues]
  return (
    <select
      aria-label={labels.value}
      className={`${INPUT_CLASS} min-w-0 flex-1`}
      value={value}
      disabled={readOnly}
      onChange={(event) => onCommit(event.target.value)}
    >
      <option value="">{labels.chooseValue}</option>
      {choices.map((choice) => (
        <option key={choice} value={choice}>
          {labels.values[choice] ?? choice}
        </option>
      ))}
    </select>
  )
}

/** The structured condition: weekday chips, time ranges, months. Each change is written at once. */
function ConditionEditor(props: {
  state: EditorState
  readOnly: boolean
  labels: RestrictionLabels
  onChange: (next: EditorState) => void
}) {
  const { state, readOnly, labels, onChange } = props
  const ends = monthEnds(state)
  const monthsOn = monthsAllowed(state) && !readOnly
  return (
    <div className="grid min-w-0 gap-2">
      <div className="grid gap-1">
        <span className={HINT}>
          {labels.days}
          {state.days.length === 0 ? ` · ${labels.everyDay}` : ''}
        </span>
        <div role="group" aria-label={labels.days} className="flex flex-wrap gap-1">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={CHIP}
              aria-pressed={state.days.includes(day)}
              disabled={readOnly}
              onClick={() => onChange(toggleDay(state, day))}
            >
              {labels.weekdays[day]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-1">
        <span className={HINT}>{labels.times}</span>
        {state.ranges.map((range, index) => (
          <div key={index} className="flex min-w-0 items-center gap-1">
            <TimeInput
              key={`from ${range.from}`}
              value={range.from}
              label={labels.from}
              disabled={readOnly}
              onCommit={(time) => onChange(setRangeEdge(state, index, 'from', time))}
            />
            <span className="text-xs text-zinc-500">{labels.to}</span>
            <TimeInput
              key={`to ${range.to}`}
              value={range.to}
              label={labels.to}
              disabled={readOnly}
              onCommit={(time) => onChange(setRangeEdge(state, index, 'to', time))}
            />
            <button
              type="button"
              className={BUTTON}
              disabled={readOnly}
              onClick={() => onChange(removeRange(state, index))}
            >
              {labels.removeTime}
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={BUTTON}
            disabled={readOnly}
            onClick={() => onChange(addRange(state))}
          >
            {labels.addTime}
          </button>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className={HINT}>{labels.months}</span>
        <select
          aria-label={labels.monthFrom}
          className={`${INPUT_CLASS} w-auto`}
          value={ends.from}
          disabled={!monthsOn}
          onChange={(event) => onChange(setMonthEdge(state, 'from', event.target.value))}
        >
          <option value="">{'–'}</option>
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {labels.monthNames[month]}
            </option>
          ))}
        </select>
        <select
          aria-label={labels.monthTo}
          className={`${INPUT_CLASS} w-auto`}
          value={ends.to}
          disabled={!monthsOn || ends.from === ''}
          onChange={(event) => onChange(setMonthEdge(state, 'to', event.target.value))}
        >
          <option value="">{'–'}</option>
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {labels.monthNames[month]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** A time of the day: the change is written on blur, and only a whole time is taken (a cleared one is put back) */
function TimeInput(props: {
  value: string
  label: string
  disabled: boolean
  onCommit: (time: string) => void
}) {
  const { value, label, disabled, onCommit } = props
  const [text, setText] = useState(value)
  return (
    <input
      type="time"
      aria-label={label}
      className={`${INPUT_CLASS} w-28`}
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value && /^\d{2}:\d{2}$/.test(text)) onCommit(text)
        else setText(value)
      }}
    />
  )
}

/**
 * A text control whose draft is written on blur (Enter applies it too). It starts from `value`; the caller gives it
 * `key={value}`, so a value that changes elsewhere starts it over.
 */
function DraftText(props: {
  id?: string
  ariaLabel: string
  value: string
  readOnly: boolean
  invalid?: boolean
  placeholder?: string
  className: string
  onCommit: (text: string) => void
}) {
  const { id, ariaLabel, value, readOnly, invalid, placeholder, className, onCommit } = props
  const [text, setText] = useState(value)
  return (
    <input
      {...PLAIN_INPUT}
      id={id}
      type="text"
      aria-label={ariaLabel}
      aria-invalid={invalid ? true : undefined}
      placeholder={placeholder}
      className={`${INPUT_CLASS} ${className} ${invalid ? 'border-red-500 dark:border-red-400' : ''}`}
      value={text}
      readOnly={readOnly}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}
