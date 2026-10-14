import { m } from '../messages.ts'
import type { RealSide } from '../sides.ts'
import type { Month, Weekday } from './condition.ts'

export type RestrictionLabels = {
  notSet: string
  values: Record<string, string>
  conditionalRules: string
  addRule: string
  removeRule: string
  rule: string
  chooseValue: string
  value: string
  condition: string
  days: string
  everyDay: string
  times: string
  addTime: string
  removeTime: string
  from: string
  to: string
  months: string
  monthFrom: string
  monthTo: string
  weekdays: Record<Weekday, string>
  monthNames: Record<Month, string>
  editAsText: string
  useFields: string
  notStructured: string
  issueNoValue: string
  issueNoCondition: string
  issueBadValue: string
  issueBadCondition: string
  issueBadRules: string
  notWritten: string
  preview: string
  multiple: string
  sides: Record<RealSide, string>
}

/**
 * The texts of the restriction field in the page's language (messages/*.json). Made when the field renders, so it
 * follows the page's language. Weekday and month names are the texts the field shows; the tags keep the OSM spelling.
 */
export function restrictionLabels(): RestrictionLabels {
  return {
    notSet: m.restriction_not_set(),
    values: {
      no_parking: m.restriction_value_no_parking(),
      no_stopping: m.restriction_value_no_stopping(),
      loading_only: m.restriction_value_loading_only(),
      charging_only: m.restriction_value_charging_only(),
    },
    conditionalRules: m.restriction_conditional_rules(),
    addRule: m.restriction_add_rule(),
    removeRule: m.restriction_remove_rule(),
    rule: m.restriction_rule(),
    chooseValue: m.restriction_choose_value(),
    value: m.restriction_value(),
    condition: m.restriction_condition(),
    days: m.restriction_days(),
    everyDay: m.restriction_every_day(),
    times: m.restriction_times(),
    addTime: m.restriction_add_time(),
    removeTime: m.restriction_remove_time(),
    from: m.restriction_from(),
    to: m.restriction_to(),
    months: m.restriction_months(),
    monthFrom: m.restriction_month_from(),
    monthTo: m.restriction_month_to(),
    weekdays: {
      Mo: m.restriction_weekday_mo(),
      Tu: m.restriction_weekday_tu(),
      We: m.restriction_weekday_we(),
      Th: m.restriction_weekday_th(),
      Fr: m.restriction_weekday_fr(),
      Sa: m.restriction_weekday_sa(),
      Su: m.restriction_weekday_su(),
      PH: m.restriction_weekday_ph(),
    },
    monthNames: {
      Jan: m.restriction_month_jan(),
      Feb: m.restriction_month_feb(),
      Mar: m.restriction_month_mar(),
      Apr: m.restriction_month_apr(),
      May: m.restriction_month_may(),
      Jun: m.restriction_month_jun(),
      Jul: m.restriction_month_jul(),
      Aug: m.restriction_month_aug(),
      Sep: m.restriction_month_sep(),
      Oct: m.restriction_month_oct(),
      Nov: m.restriction_month_nov(),
      Dec: m.restriction_month_dec(),
    },
    editAsText: m.restriction_edit_as_text(),
    useFields: m.restriction_use_fields(),
    notStructured: m.restriction_not_structured(),
    issueNoValue: m.restriction_issue_no_value(),
    issueNoCondition: m.restriction_issue_no_condition(),
    issueBadValue: m.restriction_issue_bad_value(),
    issueBadCondition: m.restriction_issue_bad_condition(),
    issueBadRules: m.restriction_issue_bad_rules(),
    notWritten: m.restriction_not_written(),
    preview: m.restriction_preview(),
    multiple: m.restriction_multiple(),
    sides: { left: m.restriction_side_left(), right: m.restriction_side_right() },
  }
}
