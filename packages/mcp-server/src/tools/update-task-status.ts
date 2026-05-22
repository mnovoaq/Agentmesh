import { UpdateTaskStatusInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const updateTaskStatusTool: ToolDef = {
  name: 'update_task_status',
  description: 'Update the status of a task you own. Use status=done to release all associated locks automatically.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'status'],
    properties: {
      task_id: { type: 'string' },
      status: { type: 'string', enum: ['in_progress', 'blocked', 'review', 'done'] },
      notes: { type: 'string', description: 'Required when status=blocked' },
      pr_url: { type: 'string', description: 'PR URL, typically when status=review' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = UpdateTaskStatusInputSchema.parse(rawInput)
    const task = await db.updateTaskStatus(input.task_id, input.status, ctx.agentId, {
      notes: input.notes,
      pr_url: input.pr_url,
    })
    return { task }
  },
}
