import { AcquireLockInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const acquireLockTool: ToolDef = {
  name: 'acquire_lock',
  description: 'Acquire exclusive locks on one or more glob path patterns. Returns conflict info if paths are already locked by another agent.',
  inputSchema: {
    type: 'object',
    required: ['paths'],
    properties: {
      paths: { type: 'array', items: { type: 'string' }, minItems: 1 },
      task_id: { type: 'string' },
      ttl_minutes: { type: 'number', description: 'Default 120, max 1440' },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = AcquireLockInputSchema.parse(rawInput)
    return db.acquireLock({
      project_id: ctx.projectId,
      paths: input.paths,
      agent_id: ctx.agentId,
      task_id: input.task_id,
      ttl_minutes: input.ttl_minutes,
    })
  },
}
