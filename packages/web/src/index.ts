#!/usr/bin/env node
import { SQLiteAdapter } from '@agentmesh/mcp-server'
import { existsSync, readFileSync } from 'node:fs'
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

const PORT = parseInt(portArg ?? '4000', 10)

// ── Start ────────────────────────────────────────────────────────────────────

const config = readConfig()
const dbPath = resolve(config.db_path.replace('~', homedir()))
const db = new SQLiteAdapter(dbPath)

// Resolve project
const projects = await db.listProjects()
if (projects.length === 0) {
  console.error('No projects found. Create one first: agentmesh project create <name>')
  process.exit(1)
}

let project = projectArg
  ? projects.find((p) => p.id === projectArg || p.name === projectArg)
  : projects.length === 1 ? projects[0] : null

if (!project) {
  console.error('Multiple projects found. Specify: agentmesh-web --project <name>')
  console.error(projects.map((p) => '  ' + p.name).join('\n'))
  process.exit(1)
}

const app = createWebServer(db, project.id, project.name)

app.listen(PORT, () => {
  console.log()
  console.log('AgentMesh Web UI')
  console.log('  project : ' + project!.name)
  console.log('  url     : http://localhost:' + PORT)
  console.log()
  console.log('Press Ctrl+C to stop.')
})

process.on('SIGINT', () => { db.close(); process.exit(0) })
