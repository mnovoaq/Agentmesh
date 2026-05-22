import { SQLiteAdapter } from '@agentmesh/mcp-server'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface AgentMeshConfig {
  db_path: string
  default_storage_adapter: string
  log_level: string
  lock_default_ttl_minutes: number
  heartbeat_timeout_minutes: number
}

const CONFIG_DIR = join(homedir(), '.agentmesh')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: AgentMeshConfig = {
  db_path: join(CONFIG_DIR, 'db.sqlite'),
  default_storage_adapter: 'sqlite',
  log_level: 'info',
  lock_default_ttl_minutes: 120,
  heartbeat_timeout_minutes: 10,
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH)
}

export function readConfig(): AgentMeshConfig {
  if (!existsSync(CONFIG_PATH)) {
    console.error('AgentMesh not initialized. Run: agentmesh init')
    process.exit(1)
  }
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }
}

export function writeConfig(config: AgentMeshConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export function initConfig(): { config: AgentMeshConfig; created: boolean } {
  if (existsSync(CONFIG_PATH)) {
    return { config: readConfig(), created: false }
  }
  mkdirSync(CONFIG_DIR, { recursive: true })
  const config = { ...DEFAULT_CONFIG }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  return { config, created: true }
}

export function openDb(dbPath?: string): SQLiteAdapter {
  const config = readConfig()
  const resolvedPath = dbPath ?? resolve(config.db_path.replace('~', homedir()))
  return new SQLiteAdapter(resolvedPath)
}
