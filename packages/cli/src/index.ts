#!/usr/bin/env node
import { Command } from 'commander'
import { registerInit } from './commands/init.js'
import { registerNotes } from './commands/notes.js'
import { registerProject } from './commands/project.js'
import { registerTasks } from './commands/tasks.js'

const program = new Command()

program
  .name('agentmesh')
  .description('AgentMesh — multi-agent orchestration for Claude Code')
  .version('0.1.0')

registerInit(program)
registerProject(program)
registerTasks(program)
registerNotes(program)

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
