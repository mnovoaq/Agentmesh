import { GetNotesInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const getNotesTool: ToolDef = {
  name: 'get_notes',
  description: 'Retrieve notes addressed to this agent (or broadcast). Marks returned notes as read.',
  inputSchema: {
    type: 'object',
    properties: {
      include_read: { type: 'boolean', description: 'Include already-read notes. Default false.' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = GetNotesInputSchema.parse(rawInput)
    const notes = await db.getNotesForAgent(ctx.agentId, input.include_read)
    return { notes }
  },
}
