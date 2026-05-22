import type { SQLiteAdapter } from '@agentmesh/mcp-server'
import express, { type Express, type Request, type Response } from 'express'
import { buildState } from './state.js'
import { getPage } from './page.js'

export function createWebServer(db: SQLiteAdapter, projectId: string, projectName: string): Express {
  const app = express()

  app.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(getPage(projectName))
  })

  app.get('/api/state', async (_req: Request, res: Response) => {
    const state = await buildState(db, projectId)
    if (!state) { res.status(404).json({ error: 'project not found' }); return }
    res.json(state)
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
