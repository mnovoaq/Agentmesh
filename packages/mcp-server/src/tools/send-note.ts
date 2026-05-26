import { LeaveNoteInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const sendNoteTool: ToolDef = {
  name: 'send_note',
  description: 'Alias for leave_note. Send a message to another agent, a role, or broadcast to all agents.',
  inputSchema: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string' },
      to_agent_id: { type: 'string' },
      to_role: { type: 'string' },
      task_id: { type: 'string' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = LeaveNoteInputSchema.parse(rawInput)
    const note = await db.leaveNote({
      project_id: ctx.projectId,
      from_agent_id: ctx.agentId,
      to_agent_id: input.to_agent_id,
      to_role: input.to_role,
      task_id: input.task_id,
      content: input.content,
    })
    return { note }
  },
}
