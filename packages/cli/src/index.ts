#!/usr/bin/env node
import { Command } from 'commander'
import { registerInit } from './commands/init.js'
import { registerStart } from './commands/start.js'
import { registerMerge } from './commands/merge.js'
import { registerWeb } from './commands/web.js'
import { registerNotes } from './commands/notes.js'
import { registerProject } from './commands/project.js'
import { registerDispatcher } from './commands/dispatcher.js'
import { registerPrune } from './commands/prune.js'
import { registerSpawn } from './commands/spawn.js'
import { registerStatus } from './commands/status.js'
import { registerStop } from './commands/stop.js'
import { registerTasks } from './commands/tasks.js'

const program = new Command()

program
  .name('agentmesh')
  .description('AgentMesh — multi-agent orchestration for Claude Code')
  .version('0.1.0')

registerInit(program)
registerStart(program)
registerProject(program)
registerSpawn(program)
registerStatus(program)
registerTasks(program)
registerNotes(program)
registerMerge(program)
registerWeb(program)
registerStop(program)
registerDispatcher(program)
registerPrune(program)

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
