import type { Command } from 'commander'
import { SQLiteAdapter } from '@agentmesh/mcp-server'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { initConfig } from '../db.js'

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize AgentMesh (creates ~/.agentmesh/config.json and db.sqlite)')
    .action(() => {
      const { config, created } = initConfig()
      const dbPath = resolve(config.db_path.replace('~', homedir()))

      if (!created) {
        console.log('AgentMesh already initialized.')
        console.log(`  config : ~/.agentmesh/config.json`)
        console.log(`  db     : ${dbPath}`)
        return
      }

      // Touch the DB to run migrations
      const db = new SQLiteAdapter(dbPath)
      db.close()

      console.log('AgentMesh initialized.')
      console.log(`  config : ~/.agentmesh/config.json`)
      console.log(`  db     : ${dbPath}`)
    })
}
