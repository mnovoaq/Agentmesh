import type { ToolDef } from './types.js'

export const heartbeatTool: ToolDef = {
  name: 'heartbeat',
  description:
    'Updates your agent heartbeat timestamp without fetching project data. ' +
    'Use this when you are thinking or processing and need to stay visible — cheaper than get_project_status.',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx, db) {
    await db.updateAgentStatus(ctx.agentId, 'working')
    return { ok: true }
  },
}
