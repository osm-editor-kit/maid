/**
 * The icons of the Berlin parking mapping project (see NOTICE.md), one PNG each. `PARKING_ICONS` maps the file name
 * without `.png` to the URL Vite gives the asset. Keep these imports out of the pure data files (sides, presets,
 * restriction): only components read them.
 */
import iconBehindertenparkplatz from './Behindertenparkplatz.png'
import iconBordstein from './Bordstein.png'
import iconEinfahrt from './Einfahrt.png'
import iconHindernis from './Hindernis.png'
import iconParkingBothFeeNo from './parking_both_fee_no.png'
import iconParkingBothFeeYes from './parking_both_fee_yes.png'
import iconParkingBothLane from './parking_both_lane.png'
import iconParkingBothMarkingsYes from './parking_both_markings_yes.png'
import iconParkingBothNo from './parking_both_no.png'
import iconParkingBothOrientationDiagonal from './parking_both_orientation_diagonal.png'
import iconParkingBothOrientationParallel from './parking_both_orientation_parallel.png'
import iconParkingBothOrientationPerpendicular from './parking_both_orientation_perpendicular.png'
import iconParkingBothRestrictionNoParking from './parking_both_restriction_no_parking.png'
import iconParkingBothRestrictionNoStopping from './parking_both_restriction_no_stopping.png'
import iconParkingBothSeparate from './parking_both_separate.png'
import iconParkingLeftFeeNo from './parking_left_fee_no.png'
import iconParkingLeftFeeYes from './parking_left_fee_yes.png'
import iconParkingLeftLane from './parking_left_lane.png'
import iconParkingLeftMarkingsYes from './parking_left_markings_yes.png'
import iconParkingLeftNo from './parking_left_no.png'
import iconParkingLeftOrientationDiagonal from './parking_left_orientation_diagonal.png'
import iconParkingLeftOrientationParallel from './parking_left_orientation_parallel.png'
import iconParkingLeftOrientationPerpendicular from './parking_left_orientation_perpendicular.png'
import iconParkingLeftRestrictionNoParking from './parking_left_restriction_no_parking.png'
import iconParkingLeftRestrictionNoStopping from './parking_left_restriction_no_stopping.png'
import iconParkingLeftSeparate from './parking_left_separate.png'
import iconParkingRightFeeNo from './parking_right_fee_no.png'
import iconParkingRightFeeYes from './parking_right_fee_yes.png'
import iconParkingRightLane from './parking_right_lane.png'
import iconParkingRightMarkingsYes from './parking_right_markings_yes.png'
import iconParkingRightNo from './parking_right_no.png'
import iconParkingRightOrientationDiagonal from './parking_right_orientation_diagonal.png'
import iconParkingRightOrientationParallel from './parking_right_orientation_parallel.png'
import iconParkingRightOrientationPerpendicular from './parking_right_orientation_perpendicular.png'
import iconParkingRightRestrictionNoParking from './parking_right_restriction_no_parking.png'
import iconParkingRightRestrictionNoStopping from './parking_right_restriction_no_stopping.png'
import iconParkingRightSeparate from './parking_right_separate.png'
import iconParkplatz from './Parkplatz.png'
import iconTiefgarageneinfahrt from './Tiefgarageneinfahrt.png'

export const PARKING_ICONS = {
  Behindertenparkplatz: iconBehindertenparkplatz,
  Bordstein: iconBordstein,
  Einfahrt: iconEinfahrt,
  Hindernis: iconHindernis,
  Parkplatz: iconParkplatz,
  Tiefgarageneinfahrt: iconTiefgarageneinfahrt,
  parking_both_fee_no: iconParkingBothFeeNo,
  parking_both_fee_yes: iconParkingBothFeeYes,
  parking_both_lane: iconParkingBothLane,
  parking_both_markings_yes: iconParkingBothMarkingsYes,
  parking_both_no: iconParkingBothNo,
  parking_both_orientation_diagonal: iconParkingBothOrientationDiagonal,
  parking_both_orientation_parallel: iconParkingBothOrientationParallel,
  parking_both_orientation_perpendicular: iconParkingBothOrientationPerpendicular,
  parking_both_restriction_no_parking: iconParkingBothRestrictionNoParking,
  parking_both_restriction_no_stopping: iconParkingBothRestrictionNoStopping,
  parking_both_separate: iconParkingBothSeparate,
  parking_left_fee_no: iconParkingLeftFeeNo,
  parking_left_fee_yes: iconParkingLeftFeeYes,
  parking_left_lane: iconParkingLeftLane,
  parking_left_markings_yes: iconParkingLeftMarkingsYes,
  parking_left_no: iconParkingLeftNo,
  parking_left_orientation_diagonal: iconParkingLeftOrientationDiagonal,
  parking_left_orientation_parallel: iconParkingLeftOrientationParallel,
  parking_left_orientation_perpendicular: iconParkingLeftOrientationPerpendicular,
  parking_left_restriction_no_parking: iconParkingLeftRestrictionNoParking,
  parking_left_restriction_no_stopping: iconParkingLeftRestrictionNoStopping,
  parking_left_separate: iconParkingLeftSeparate,
  parking_right_fee_no: iconParkingRightFeeNo,
  parking_right_fee_yes: iconParkingRightFeeYes,
  parking_right_lane: iconParkingRightLane,
  parking_right_markings_yes: iconParkingRightMarkingsYes,
  parking_right_no: iconParkingRightNo,
  parking_right_orientation_diagonal: iconParkingRightOrientationDiagonal,
  parking_right_orientation_parallel: iconParkingRightOrientationParallel,
  parking_right_orientation_perpendicular: iconParkingRightOrientationPerpendicular,
  parking_right_restriction_no_parking: iconParkingRightRestrictionNoParking,
  parking_right_restriction_no_stopping: iconParkingRightRestrictionNoStopping,
  parking_right_separate: iconParkingRightSeparate,
} as const

export type ParkingIconName = keyof typeof PARKING_ICONS
