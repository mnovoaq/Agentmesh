import { ReportBlockerInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const reportBlockerTool: ToolDef = {
  name: 'report_blocker',
  description: 'Shortcut: sets task status=blocked and broadcasts a note to the orchestrator role.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'reason'],
    properties: {
      task_id: { type: 'string' },
      reason: { type: 'string' },
      needs_role: { type: 'string', description: 'Optionally specify which role can unblock this' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = ReportBlockerInputSchema.parse(rawInput)

    const task = await db.updateTaskStatus(input.task_id, 'blocked', ctx.agentId, { notes: input.reason })

    const noteContent = `BLOCKER on task ${input.task_id}: ${input.reason}${input.needs_role ? ` [needs: ${input.needs_role}]` : ''}`
    const note = await db.leaveNote({
      project_id: ctx.projectId,
      from_agent_id: ctx.agentId,
      to_role: 'orchestrator',
      task_id: input.task_id,
      content: noteContent,
    })

    return { task, note }
  },
}
