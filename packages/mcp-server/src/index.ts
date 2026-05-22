import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SQLiteAdapter } from './storage/sqlite.js'
import { createAgentMeshServer } from './server.js'
import { logger } from './utils/logger.js'

const agentId = process.env['AGENTMESH_AGENT_ID']
const dbPath = process.env['AGENTMESH_DB_PATH'] ?? `${process.env['HOME'] ?? process.env['USERPROFILE']}/.agentmesh/db.sqlite`

if (!agentId) {
  logger.error('AGENTMESH_AGENT_ID environment variable is required')
  process.exit(1)
}

const db = new SQLiteAdapter(dbPath)
const server = createAgentMeshServer(db, agentId)
const transport = new StdioServerTransport()

await server.connect(transport)
logger.info({ agent_id: agentId, db_path: dbPath }, 'agentmesh-mcp started')
