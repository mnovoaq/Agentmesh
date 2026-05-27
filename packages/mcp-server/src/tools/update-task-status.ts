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

    const unblocked: string[] = []

    // When a task reaches done/review, auto-notify agents whose tasks just became claimable
    if (input.status === 'done' || input.status === 'review') {
      const downstream = await db.findNowUnblockedDownstream(task.id, task.project_id)
      for (const dt of downstream) {
        await db.leaveNote({
          project_id: task.project_id,
          from_agent_id: null,
          to_agent_id: dt.assigned_agent_id ?? null,
          to_role: dt.assigned_agent_id ? null : dt.role_required,
          content: `✅ Tu tarea "${dt.title}" está desbloqueada — todas sus dependencias llegaron a done/review. Podés reclamarla ahora con claim_task.`,
        })
        unblocked.push(dt.title)
      }
    }

    return { task, unblocked_tasks: unblocked }
  },
}
