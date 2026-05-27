import { ClaimTaskInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const claimTaskTool: ToolDef = {
  name: 'claim_task',
  description: 'Claim a task from the backlog. Optionally acquires locks on given paths. Idempotent if already claimed by this agent.',
  inputSchema: {
    type: 'object',
    required: ['task_id'],
    properties: {
      task_id: { type: 'string' },
      paths_to_lock: { type: 'array', items: { type: 'string' } },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = ClaimTaskInputSchema.parse(rawInput)

    const claimResult = await db.claimTask(input.task_id, ctx.agentId)
    if (!claimResult.success) return claimResult

    // Auto-populate branch_name from agent record if not already set on task
    if (!claimResult.task.branch_name) {
      const agent = await db.getAgent(ctx.agentId)
      if (agent?.branch_name) {
        await db.setTaskBranch(input.task_id, agent.branch_name)
        claimResult.task.branch_name = agent.branch_name
      }
    }

    if (input.paths_to_lock?.length) {
      const lockResult = await db.acquireLock({
        project_id: ctx.projectId,
        paths: input.paths_to_lock,
        agent_id: ctx.agentId,
        task_id: input.task_id,
      })
      if (!lockResult.success) {
        return { success: false, task: claimResult.task, locks: [], error: 'Lock conflict after claim', code: 'LOCK_CONFLICT', conflicts: lockResult.conflicts }
      }
      return { success: true, task: claimResult.task, locks: lockResult.locks }
    }

    return { success: true, task: claimResult.task, locks: [] }
  },
}
