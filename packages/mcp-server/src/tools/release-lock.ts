import { ReleaseLockInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const releaseLockTool: ToolDef = {
  name: 'release_lock',
  description: 'Release a lock you hold.',
  inputSchema: {
    type: 'object',
    required: ['lock_id'],
    properties: {
      lock_id: { type: 'string' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = ReleaseLockInputSchema.parse(rawInput)
    await db.releaseLock(input.lock_id, ctx.agentId)
    return { success: true }
  },
}
