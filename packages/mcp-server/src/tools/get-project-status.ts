import type { TaskStatus } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

const ALL_STATUSES: TaskStatus[] = ['backlog', 'claimed', 'in_progress', 'blocked', 'review', 'done', 'cancelled']

export const getProjectStatusTool: ToolDef = {
  name: 'get_project_status',
  description: 'Returns project summary: active agents, task counts by status, and recent events.',
  inputSchema: { type: 'object', properties: {} },
  async execute(_rawInput, ctx, db) {
    const [agents, events] = await Promise.all([
      db.listAgents(ctx.projectId),
      db.listEvents(ctx.projectId, 20),
    ])

    const tasksByStatus: Record<string, number> = {}
    await Promise.all(
      ALL_STATUSES.map(async (status) => {
        const tasks = await db.listTasks({ project_id: ctx.projectId, status })
        tasksByStatus[status] = tasks.length
      })
    )

    const agentSummaries = agents.map((a) => ({
      id: a.id,
      role: a.role,
      status: a.status,
      last_heartbeat: a.last_heartbeat,
    }))

    return { agents: agentSummaries, tasks_by_status: tasksByStatus, recent_events: events }
  },
}
