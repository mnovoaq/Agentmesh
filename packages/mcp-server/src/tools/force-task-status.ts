import type { TaskStatus } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const forceTaskStatusTool: ToolDef = {
  name: 'force_task_status',
  description: 'Orchestrator-only: force-update any task status regardless of which agent owns it. Use when an agent is unresponsive or a pipeline is stuck.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'status'],
    properties: {
      task_id: { type: 'string' },
      status: { type: 'string', enum: ['backlog', 'in_progress', 'blocked', 'review', 'done', 'cancelled'] },
      notes: { type: 'string' },
      pr_url: { type: 'string' },
    },
  },
  async execute(rawInput, ctx, db) {
    const { task_id, status, notes, pr_url } = rawInput as { task_id: string; status: TaskStatus; notes?: string; pr_url?: string }
    if (!task_id || !status) throw new Error('task_id and status are required')

    const task = await db.forceUpdateTaskStatus(task_id, status, { notes, pr_url })

    const unblocked: string[] = []
    if (status === 'done' || status === 'review') {
      const downstream = await db.findNowUnblockedDownstream(task.id, task.project_id)
      for (const dt of downstream) {
        await db.leaveNote({
          project_id: task.project_id,
          from_agent_id: null,
          to_agent_id: dt.assigned_agent_id ?? null,
          to_role: dt.assigned_agent_id ? null : dt.role_required,
          content: `✅ Tu tarea "${dt.title}" está desbloqueada — el orquestador forzó el avance de su dependencia. Reclamala ahora con claim_task.`,
        })
        unblocked.push(dt.title)
      }
    }

    return { task, unblocked_tasks: unblocked }
  },
}
