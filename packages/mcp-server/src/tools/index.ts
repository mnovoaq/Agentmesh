import { acquireLockTool } from './acquire-lock.js'
import { heartbeatTool } from './heartbeat.js'
import { cancelTaskTool } from './cancel-task.js'
import { claimTaskTool } from './claim-task.js'
import { createTaskTool } from './create-task.js'
import { forceTaskStatusTool } from './force-task-status.js'
import { getMyTasksTool } from './get-my-tasks.js'
import { getNotesTool } from './get-notes.js'
import { getProjectStatusTool } from './get-project-status.js'
import { leaveNoteTool } from './leave-note.js'
import { listTasksTool } from './list-tasks.js'
import { releaseLockTool } from './release-lock.js'
import { reportBlockerTool } from './report-blocker.js'
import { reassignTaskTool } from './reassign-task.js'
import { sendNoteTool } from './send-note.js'
import { updateTaskDependenciesTool } from './update-task-dependencies.js'
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
  heartbeatTool,
]

export const orchestratorTools = [
  createTaskTool,
  listTasksTool,
  sendNoteTool,
  updateTaskDependenciesTool,
  reassignTaskTool,
  cancelTaskTool,
  forceTaskStatusTool,
]

export const ORCHESTRATOR_ONLY = new Set(orchestratorTools.map((t) => t.name))

export const allTools = [...workerTools, ...orchestratorTools]
