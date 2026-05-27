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

// Mark agent as active now that Claude Code is connected
await db.updateAgentStatus(agentId, 'working')

// Mark agent as idle on clean exit
const onExit = () => {
  try { db.updateAgentStatus(agentId, 'idle') } catch { /* best-effort */ }
}
process.once('exit',    onExit)
process.once('SIGINT',  () => { onExit(); process.exit(0) })
process.once('SIGTERM', () => { onExit(); process.exit(0) })

// Prune expired locks every 5 minutes
const LOCK_PRUNE_INTERVAL_MS = 5 * 60 * 1000
setInterval(async () => {
  const pruned = await db.pruneExpiredLocks()
  if (pruned > 0) logger.info({ pruned }, 'expired locks pruned')
}, LOCK_PRUNE_INTERVAL_MS).unref()

// Nudge agents with in_progress tasks but stale heartbeat (every 2 minutes)
const STALE_NUDGE_INTERVAL_MS = 2 * 60 * 1000
const STALE_WARN_MS  = 10 * 60 * 1000  // 10 min → remind agent
const STALE_ALERT_MS = 20 * 60 * 1000  // 20 min → alert orchestrator
setInterval(async () => {
  try {
    const staleTasks = db.getStaleInProgressTasks(STALE_WARN_MS)
    for (const row of staleTasks) {
      const ageMin = Math.round(row.heartbeatAge / 60000)
      if (row.heartbeatAge >= STALE_ALERT_MS) {
        // Alert orchestrator — agent unresponsive
        await db.leaveNote({
          project_id: row.project_id,
          from_agent_id: null,
          to_role: 'orchestrator' as const,
          content: `⚠ Agente ${row.agent_role} (${row.agent_id.slice(0, 8)}) lleva ${ageMin} min sin actividad en tarea "${row.task_title}". Considera force_task_status o reassign_task.`,
        })
        logger.warn({ agent_id: row.agent_id, task_id: row.task_id, ageMin }, 'stale agent alerted to orchestrator')
      } else {
        // Remind agent
        await db.leaveNote({
          project_id: row.project_id,
          from_agent_id: null,
          to_agent_id: row.agent_id,
          content: `⏰ Llevas ${ageMin} min sin actividad MCP en la tarea "${row.task_title}". Si terminaste el trabajo, actualizá el status con update_task_status(status="done") y avisá al orquestador.`,
        })
        logger.info({ agent_id: row.agent_id, task_id: row.task_id, ageMin }, 'stale agent nudged')
      }
    }
  } catch (err) {
    logger.error({ err }, 'stale task nudge error')
  }
}, STALE_NUDGE_INTERVAL_MS).unref()
