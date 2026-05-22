import type { StorageAdapter } from '@agentmesh/shared'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { workerTools } from './tools/index.js'
import { resolveAgent } from './utils/auth.js'
import { logger } from './utils/logger.js'

const ALL_TOOLS = workerTools

export function createAgentMeshServer(db: StorageAdapter, agentId: string): Server {
  const server = new Server(
    { name: 'agentmesh-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const tool = ALL_TOOLS.find((t) => t.name === name)

    if (!tool) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}`, code: 'UNKNOWN_TOOL' }) }] }
    }

    try {
      const agent = await resolveAgent(db, agentId)
      if (!agent) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }) }] }
      }

      // Implicit heartbeat on every call
      await db.heartbeatAgent(agentId)

      const result = await tool.execute(args ?? {}, { agentId: agent.id, projectId: agent.project_id, role: agent.role }, db)
      logger.debug({ tool: name, agent_id: agentId }, 'tool called')
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      logger.error({ tool: name, agent_id: agentId, err }, 'tool error')
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { content: [{ type: 'text', text: JSON.stringify({ error: message, code: 'INTERNAL_ERROR' }) }] }
    }
  })

  return server
}
