import { CancelTaskInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const cancelTaskTool: ToolDef = {
  name: 'cancel_task',
  description: '[Orchestrator only] Cancel a task with a reason.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'reason'],
    properties: {
      task_id: { type: 'string' },
      reason: { type: 'string' },
    },
  },
  async execute(rawInput, _ctx, db) {
    const input = CancelTaskInputSchema.parse(rawInput)
    const task = await db.cancelTask(input.task_id, input.reason)
    return { task }
  },
}
