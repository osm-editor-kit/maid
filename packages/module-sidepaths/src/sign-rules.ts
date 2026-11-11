/**
 * The traffic sign rules the TILDA package reads: which tags a sign implies on a way (a "Radweg" sign makes the
 * extracted way `highway=cycleway` and `bicycle=designated`), and how the signs of two parts join into one value. From
 * the traffic sign converter, loaded on first use as the iD fork iD-Radnetz loads it (`traffic_sign/recommender.ts`).
 * German signs only, like the rest of the bicycle editor.
 */
import type { SignRules } from './extract.ts'

let rules: SignRules | undefined
let loading: Promise<SignRules> | undefined

/** The rules once they are loaded; `undefined` until then. Starts loading on the first call. */
export function signRules(): SignRules | undefined {
  if (rules) return rules
  loading ??= import('@osm-traffic-signs/converter')
    .then((converter) => {
      rules = {
        recommend: (value) =>
          Object.fromEntries(
            converter.signsToTags(converter.trafficSignTagToSigns(value, 'DE'), 'DE', 'way'),
          ),
        joinSigns: (bike, foot) =>
          converter.signsToTrafficSignTagValue(
            [
              ...converter.trafficSignTagToSigns(bike, 'DE'),
              ...converter.trafficSignTagToSigns(foot, 'DE'),
            ],
            'DE',
          ),
      }
      return rules
    })
    .catch(() => {
      // without the converter the package reads no signs: extract anyway
      rules = {}
      return rules
    })
  return undefined
}

/** For tests and for code that can wait */
export async function loadSignRules(): Promise<SignRules> {
  return signRules() ?? (await loading!)
}
