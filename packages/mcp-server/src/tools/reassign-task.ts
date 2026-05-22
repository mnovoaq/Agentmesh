import { ReassignTaskInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const reassignTaskTool: ToolDef = {
  name: 'reassign_task',
  description: '[Orchestrator only] Reassign a task to a different agent.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'to_agent_id'],
    properties: {
      task_id: { type: 'string' },
      to_agent_id: { type: 'string' },
    },
  },
  async execute(rawInput, _ctx, db) {
    const input = ReassignTaskInputSchema.parse(rawInput)
    const task = await db.reassignTask(input.task_id, input.to_agent_id)
    return { task }
  },
}
