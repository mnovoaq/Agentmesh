import { acquireLockTool } from './acquire-lock.js'
import { claimTaskTool } from './claim-task.js'
import { getMyTasksTool } from './get-my-tasks.js'
import { getNotesTool } from './get-notes.js'
import { getProjectStatusTool } from './get-project-status.js'
import { leaveNoteTool } from './leave-note.js'
import { releaseLockTool } from './release-lock.js'
import { reportBlockerTool } from './report-blocker.js'
import { updateTaskStatusTool } from './update-task-status.js'

export const workerTools = [
  getMyTasksTool,
  claimTaskTool,
  updateTaskStatusTool,
  acquireLockTool,
  releaseLockTool,
  leaveNoteTool,
  getNotesTool,
  reportBlockerTool,
  getProjectStatusTool,
]
