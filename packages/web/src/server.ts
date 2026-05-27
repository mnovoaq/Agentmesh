import type { SQLiteAdapter } from '@agentmesh/mcp-server'
import type { AgentRole } from '@agentmesh/shared'
import express, { type Express, type Request, type Response } from 'express'
import { buildState } from './state.js'
import { getPage } from './page.js'
import { spawnAgent, detectDefaultBranch } from './spawn.js'

export function createWebServer(
  db: SQLiteAdapter,
  projectId: string,
  projectName: string,
  dbPath: string,
): Express {
  const app = express()
  app.use(express.json())

  app.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(getPage(projectName))
  })

  app.get('/api/default-branch', async (_req: Request, res: Response) => {
    const project = await db.getProject(projectId)
    if (!project) { res.status(404).json({ error: 'project not found' }); return }
    res.json({ branch: detectDefaultBranch(project.repo_path) })
  })

  app.get('/api/state', async (_req: Request, res: Response) => {
    const state = await buildState(db, projectId)
    if (!state) { res.status(404).json({ error: 'project not found' }); return }
    res.json(state)
  })

  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const { title, description, acceptance_criteria, role_required } = req.body as {
        title: string; description?: string; acceptance_criteria?: string; role_required: string
      }
      if (!title || !role_required) { res.status(400).json({ error: 'title and role_required are required' }); return }
      const task = await db.createTask({
        project_id: projectId,
        title,
        description: description ?? '-',
        acceptance_criteria: acceptance_criteria ?? 'To be defined',
        role_required: role_required as AgentRole,
      })
      res.json(task)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.post('/api/agents/spawn', async (req: Request, res: Response) => {
    try {
      const { role, base_branch } = req.body as { role: AgentRole; base_branch?: string }
      if (!role) { res.status(400).json({ error: 'role is required' }); return }
      const project = await db.getProject(projectId)
      if (!project) { res.status(404).json({ error: 'project not found' }); return }
      const result = await spawnAgent(db, project, { role, base_branch }, dbPath)
      if (!result.success) { res.status(400).json({ error: result.error }); return }
      res.json(result.agent)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.post('/api/agents/:id/stop', async (req: Request, res: Response) => {
    try {
      const agentId = req.params['id']
      if (!agentId) { res.status(400).json({ error: 'agent id required' }); return }
      await db.stopAgent(agentId)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.post('/api/agents/:id/nudge', async (req: Request, res: Response) => {
    try {
      const agentId = req.params['id']
      if (!agentId) { res.status(400).json({ error: 'agent id required' }); return }
      const agents = await db.listAgents(projectId)
      const orchestrator = agents.find((a) => a.role === 'orchestrator')
      if (!orchestrator) { res.status(400).json({ error: 'no orchestrator found' }); return }
      await db.leaveNote({
        project_id: projectId,
        from_agent_id: orchestrator.id,
        to_agent_id: agentId,
        content: 'Ciclo forzado: llama get_notes y get_my_tasks ahora. Si hay tareas para tu rol, reclámalas y trabájalas de inmediato.',
      })
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.get('/api/tasks/:id', async (req: Request, res: Response) => {
    try {
      const task = await db.getTask(req.params['id'] ?? '')
      if (!task) { res.status(404).json({ error: 'task not found' }); return }
      res.json(task)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.post('/hook', async (req: Request, res: Response) => {
    try {
      const { agent_id, tool_name, tool_input } = req.body as {
        agent_id?: string
        tool_name?: string
        tool_input?: Record<string, unknown>
      }
      if (!agent_id || !tool_name) { res.json({ ok: false }); return }
      const agent = await db.getAgent(agent_id)
      if (!agent) { res.json({ ok: false }); return }
      await db.logEvent({
        project_id: agent.project_id,
        agent_id: agent.id,
        event_type: 'hook:' + tool_name,
        payload: tool_input ?? {},
      })
      res.json({ ok: true })
    } catch { res.json({ ok: false }) }
  })

  app.get('/events', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.flushHeaders()

    const send = async () => {
      const state = await buildState(db, projectId)
      if (state) res.write('data: ' + JSON.stringify(state) + '\n\n')
    }

    await send()
    const interval = setInterval(send, 1000)
    req.on('close', () => clearInterval(interval))
  })

  return app
}
