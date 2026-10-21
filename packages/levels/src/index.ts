/**
 * Building levels (floors) of OSM features: reading `level`, `repeat_on`, `min_level`/`max_level`, and the floors a
 * set of features is on. Pure functions, no map and no editor, shared by the level mode and the 3D view.
 * Research: docs/research/indoor/README.md (Simple Indoor Tagging, MapComplete's floor selector).
 */
export { levelsOf, parseLevels, type LevelProblem, type Levels } from './parse.ts'
export { floorsOf } from './floors.ts'
export { levelState, NEIGHBOUR_RANGE, type LevelState } from './shown.ts'
