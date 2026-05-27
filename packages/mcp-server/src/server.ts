import type { StorageAdapter } from '@agentmesh/shared'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ORCHESTRATOR_ONLY, allTools } from './tools/index.js'
import { resolveAgent } from './utils/auth.js'
import { logger } from './utils/logger.js'

const SKIP_LOG = new Set([
  'get_my_tasks', 'get_notes', 'get_project_status', 'list_tasks', 'release_lock',
])

function summarizeArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  if (tool === 'update_task_status' || tool === 'force_task_status')
    return { task_id: args['task_id'], status: args['status'] }
  if (tool === 'claim_task')   return { task_id: args['task_id'] }
  if (tool === 'acquire_lock') return { paths: args['paths'] }
  if (tool === 'leave_note')   return { to_role: args['to_role'], to_agent_id: args['to_agent_id'] }
  if (tool === 'report_blocker') return { task_id: args['task_id'] }
  if (tool === 'create_task')  return { title: args['title'] }
  if (tool === 'reassign_task') return { task_id: args['task_id'], to_agent_id: args['to_agent_id'] }
  if (tool === 'cancel_task')  return { task_id: args['task_id'] }
  if (tool === 'send_note')    return { to_role: args['to_role'], to_agent_id: args['to_agent_id'] }
  return {}
}

export function createAgentMeshServer(db: StorageAdapter, agentId: string): Server {
  const server = new Server(
    { name: 'agentmesh-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const tool = allTools.find((t) => t.name === name)

    if (!tool) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}`, code: 'UNKNOWN_TOOL' }) }] }
    }

    try {
      const agent = await resolveAgent(db, agentId)
      if (!agent) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }) }] }
      }

      // Role gate: orchestrator-only tools reject non-orchestrators
      if (ORCHESTRATOR_ONLY.has(name) && agent.role !== 'orchestrator') {
        logger.warn({ tool: name, agent_id: agentId, role: agent.role }, 'forbidden: orchestrator-only tool')
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Access denied: orchestrator role required', code: 'FORBIDDEN' }) }] }
      }

      // Implicit heartbeat on every call
      await db.heartbeatAgent(agentId)

      const result = await tool.execute(args ?? {}, { agentId: agent.id, projectId: agent.project_id, role: agent.role }, db)
      logger.debug({ tool: name, agent_id: agentId }, 'tool called')

      if (!SKIP_LOG.has(name)) {
        db.logEvent({
          project_id: agent.project_id,
          agent_id: agent.id,
          event_type: 'tool:' + name,
          payload: summarizeArgs(name, (args ?? {}) as Record<string, unknown>),
        }).catch(() => { /* best-effort */ })
      }

      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      logger.error({ tool: name, agent_id: agentId, err }, 'tool error')
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { content: [{ type: 'text', text: JSON.stringify({ error: message, code: 'INTERNAL_ERROR' }) }] }
    }
  })

  return server
}
