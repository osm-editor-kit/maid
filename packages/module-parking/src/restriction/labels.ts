import { pick } from '../language.ts'
import type { RealSide } from '../sides.ts'
import type { Month, Weekday } from './condition.ts'

/**
 * The texts of the restriction field, in English and German. The app starts in German.
 * TODO: this moves to packages/i18n once the module texts are there; keep the keys in step with the German.
 */
const en = {
  notSet: 'Not set',
  values: {
    no_parking: 'No parking',
    no_stopping: 'No stopping',
    loading_only: 'Loading and unloading only',
    charging_only: 'Charging only',
  } as Record<string, string>,
  conditionalRules: 'Conditional rules',
  addRule: 'Add rule',
  removeRule: 'Remove rule',
  rule: 'Rule',
  chooseValue: 'Choose a value',
  value: 'Value',
  condition: 'Condition',
  days: 'Days',
  everyDay: 'Every day',
  times: 'Times',
  addTime: 'Add time',
  removeTime: 'Remove time',
  from: 'from',
  to: 'to',
  months: 'Months',
  monthFrom: 'From month',
  monthTo: 'To month',
  weekdays: {
    Mo: 'Mo',
    Tu: 'Tu',
    We: 'We',
    Th: 'Th',
    Fr: 'Fr',
    Sa: 'Sa',
    Su: 'Su',
    PH: 'PH',
  } as Record<Weekday, string>,
  monthNames: {
    Jan: 'Jan',
    Feb: 'Feb',
    Mar: 'Mar',
    Apr: 'Apr',
    May: 'May',
    Jun: 'Jun',
    Jul: 'Jul',
    Aug: 'Aug',
    Sep: 'Sep',
    Oct: 'Oct',
    Nov: 'Nov',
    Dec: 'Dec',
  } as Record<Month, string>,
  editAsText: 'Edit as text',
  useFields: 'Use fields',
  notStructured: 'Not read as days and times: edit as text.',
  kept: 'Kept as written: the text does not read back the same. Correct it here.',
  issueNoValue: 'Not written yet: the rule needs a value.',
  issueNoCondition:
    'Not written yet: the rule needs a condition. A value that always holds goes in the field above.',
  issueBadValue: 'A value may not contain ; @ ( ) and may not start or end with a space.',
  issueBadCondition: 'The condition does not read back the same. Edit it as text.',
  issueBadRules: 'The rules do not read back the same. Check the parentheses.',
  notWritten: 'Not written until the rules are valid.',
  preview: 'Tag text as written',
  multiple: 'Multiple values',
  sides: { left: 'Left side', right: 'Right side' } as Record<RealSide, string>,
}

const de: typeof en = {
  notSet: 'Nicht gesetzt',
  values: {
    no_parking: 'Parken verboten',
    no_stopping: 'Halten verboten',
    loading_only: 'Nur Be- und Entladen',
    charging_only: 'Nur Laden',
  },
  conditionalRules: 'Bedingte Regeln',
  addRule: 'Regel hinzufügen',
  removeRule: 'Regel entfernen',
  rule: 'Regel',
  chooseValue: 'Wert wählen',
  value: 'Wert',
  condition: 'Bedingung',
  days: 'Tage',
  everyDay: 'Jeden Tag',
  times: 'Zeiten',
  addTime: 'Zeit hinzufügen',
  removeTime: 'Zeit entfernen',
  from: 'von',
  to: 'bis',
  months: 'Monate',
  monthFrom: 'Von Monat',
  monthTo: 'Bis Monat',
  weekdays: { Mo: 'Mo', Tu: 'Di', We: 'Mi', Th: 'Do', Fr: 'Fr', Sa: 'Sa', Su: 'So', PH: 'PH' },
  monthNames: {
    Jan: 'Jan',
    Feb: 'Feb',
    Mar: 'Mär',
    Apr: 'Apr',
    May: 'Mai',
    Jun: 'Jun',
    Jul: 'Jul',
    Aug: 'Aug',
    Sep: 'Sep',
    Oct: 'Okt',
    Nov: 'Nov',
    Dec: 'Dez',
  },
  editAsText: 'Als Text bearbeiten',
  useFields: 'Mit Feldern bearbeiten',
  notStructured: 'Nicht als Tage und Zeiten lesbar: als Text bearbeiten.',
  kept: 'Unverändert gelassen: der Text liest sich nicht wieder gleich. Hier korrigieren.',
  issueNoValue: 'Noch nicht geschrieben: die Regel braucht einen Wert.',
  issueNoCondition:
    'Noch nicht geschrieben: die Regel braucht eine Bedingung. Ein Wert, der immer gilt, gehört in das Feld darüber.',
  issueBadValue:
    'Ein Wert darf nicht ; @ ( ) enthalten und nicht mit einem Leerzeichen beginnen oder enden.',
  issueBadCondition: 'Die Bedingung liest sich nach dem Schreiben anders. Als Text bearbeiten.',
  issueBadRules: 'Die Regeln lesen sich nicht wieder gleich. Klammern prüfen.',
  notWritten: 'Nicht geschrieben, bis die Regeln gültig sind.',
  preview: 'Geschriebener Tag-Text',
  multiple: 'Mehrere Werte',
  sides: { left: 'Linke Seite', right: 'Rechte Seite' },
}

export type RestrictionLabels = typeof en

/** The labels for the page's language: German or English */
export function restrictionLabels(): RestrictionLabels {
  return pick(en, de)
}
