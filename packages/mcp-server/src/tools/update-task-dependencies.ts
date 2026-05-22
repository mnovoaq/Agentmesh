import { UpdateTaskDependenciesInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const updateTaskDependenciesTool: ToolDef = {
  name: 'update_task_dependencies',
  description: '[Orchestrator only] Replace the dependency list for a task. Pass an empty array to clear all deps.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'depends_on'],
    properties: {
      task_id: { type: 'string' },
      depends_on: { type: 'array', items: { type: 'string' } },
    },
  },
  async execute(rawInput, _ctx, db) {
    const input = UpdateTaskDependenciesInputSchema.parse(rawInput)
    await db.updateTaskDependencies(input.task_id, input.depends_on)
    const task = await db.getTask(input.task_id)
    return { task }
  },
}
