import { GetMyTasksInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const getMyTasksTool: ToolDef = {
  name: 'get_my_tasks',
  description: 'Returns tasks claimable by this agent (role match + deps met) and tasks already assigned to this agent.',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'array', items: { type: 'string' }, description: 'Filter by status' },
      include_unclaimable: { type: 'boolean', description: 'Also return tasks blocked by unmet deps' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = GetMyTasksInputSchema.parse(rawInput)

    const mine = await db.listTasks({
      project_id: ctx.projectId,
      assigned_agent_id: ctx.agentId,
      status: ['claimed', 'in_progress', 'blocked', 'review'],
    })

    const candidates = await db.listTasks({
      project_id: ctx.projectId,
      role_required: ctx.role,
      status: 'backlog',
    })

    const claimable = []
    const blocked = []

    for (const task of candidates) {
      const unmet = await db.listUnmetDependencies(task.id)
      if (unmet.length === 0) {
        claimable.push(task)
      } else if (input.include_unclaimable) {
        blocked.push({ ...task, _blocked_by: unmet })
      }
    }

    return { claimable, mine, blocked }
  },
}
