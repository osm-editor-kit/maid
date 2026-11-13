/**
 * HOT's Tasking Manager in Maid, read only: a link opens a project at one of its tasks, with the task area on the map,
 * the instructions in the dock and the project's changeset comment in the save form.
 */
export {
  MOCK_TASKING_MANAGER_API,
  TASKING_MANAGER_API,
  TASKING_MANAGER_SITE,
  taskingManager,
} from './module.tsx'
export { parseAsTmLink, TM_PARAM } from './url.ts'
