import type { TaskStatus } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const listTasksTool: ToolDef = {
  name: 'list_tasks',
  description: 'Returns all tasks for this project. Orchestrator tool for global project visibility.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by one or more statuses (backlog, claimed, in_progress, blocked, review, done, cancelled)',
      },
      role: { type: 'string', description: 'Filter by role_required' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = rawInput as { status?: TaskStatus | TaskStatus[]; role?: string }
    const tasks = await db.listTasks({
      project_id: ctx.projectId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.role ? { role_required: input.role as any } : {}),
    })
    return { tasks, total: tasks.length }
  },
}
