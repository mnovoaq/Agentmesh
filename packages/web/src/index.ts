#!/usr/bin/env node
import { SQLiteAdapter } from '@agentmesh/mcp-server'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { createWebServer } from './server.js'

// ── Config ───────────────────────────────────────────────────────────────────

const CONFIG_PATH = resolve(homedir(), '.agentmesh', 'config.json')

function readConfig(): { db_path: string } {
  if (!existsSync(CONFIG_PATH)) {
    console.error('AgentMesh not initialized. Run: agentmesh init')
    process.exit(1)
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const portArg = args.find((a) => a.startsWith('--port='))?.split('=')[1]
  ?? args[args.indexOf('--port') + 1]
const projectArg = args.find((a) => a.startsWith('--project='))?.split('=')[1]
  ?? args[args.indexOf('--project') + 1]
const shouldOpen = args.includes('--open')

const PORT = parseInt(portArg ?? '4000', 10)

// ── Start ────────────────────────────────────────────────────────────────────

const config = readConfig()
const dbPath = resolve(config.db_path.replace('~', homedir()))
const db = new SQLiteAdapter(dbPath)

// Resolve project
const projects = await db.listProjects()
if (projects.length === 0) {
  console.error('No projects found. Run: agentmesh start')
  process.exit(1)
}

let project = projectArg
  ? projects.find((p) => p.id === projectArg || p.name === projectArg)
  : projects.length === 1 ? projects[0] : null

if (!project) {
  console.error('Multiple projects found. Specify: agentmesh web --project <name>')
  console.error(projects.map((p) => '  ' + p.name).join('\n'))
  process.exit(1)
}

const app = createWebServer(db, project.id, project.name, dbPath)

const server = app.listen(PORT, () => {
  // Store port so agent hook scripts can find it
  try { writeFileSync(resolve(homedir(), '.agentmesh', 'web-port'), String(PORT)) } catch { /* best-effort */ }

  console.log()
  console.log('AgentMesh Web UI')
  console.log('  project : ' + project!.name)
  console.log('  url     : http://localhost:' + PORT)
  console.log()
  console.log('Press Ctrl+C to stop.')

  if (shouldOpen) {
    try {
      if (process.platform === 'win32') {
        execSync('cmd /c start "" "http://localhost:' + PORT + '"', { stdio: 'ignore' })
      } else if (process.platform === 'darwin') {
        execSync('open "http://localhost:' + PORT + '"', { stdio: 'ignore' })
      } else {
        execSync('xdg-open "http://localhost:' + PORT + '"', { stdio: 'ignore' })
      }
    } catch { /* ignore */ }
  }
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: agentmesh start --port ${PORT + 1}`)
  } else {
    console.error('Server error:', err.message)
  }
  db.close()
  process.exit(1)
})

process.on('SIGINT', () => { db.close(); process.exit(0) })
