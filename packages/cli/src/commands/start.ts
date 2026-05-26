import type { Command } from 'commander'
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initConfig, openDb, readConfig } from '../db.js'
import { buildClaude, detectDefaultBranch, findMcpBin } from './spawn.js'

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start AgentMesh for the current directory (auto-init + opens browser)')
    .option('--port <n>', 'Port to listen on', '4000')
    .action(async (opts: { port: string }) => {
      const cwd = process.cwd()
      const port = parseInt(opts.port, 10)

      // 1. Init global config if needed
      initConfig()

      // 2. Ensure git repo exists
      let isGit = true
      try { execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' }) }
      catch { isGit = false }

      if (!isGit) {
        console.log('Initializing git repository...')
        execSync('git init', { cwd, stdio: 'pipe' })
        try {
          execSync('git commit --allow-empty -m "init"', { cwd, stdio: ['ignore', 'ignore', 'ignore'] })
        } catch {
          console.log('Note: add a git commit before spawning agents (git config user.email required).')
        }
      }

      // 3. Find or create project for this directory
      const config = readConfig()
      const dbPath = resolve(config.db_path.replace('~', homedir()))
      const db = openDb()
      const projects = await db.listProjects()
      let project = projects.find((p) => resolve(p.repo_path) === resolve(cwd))
      if (!project) {
        const name = basename(cwd)
        project = await db.createProject({ name, repo_path: cwd })
        console.log('Project created: ' + name)
      }

      // 4. Detect default branch + ensure orchestrator agent exists
      const defaultBranch = detectDefaultBranch(cwd)
      const agents = await db.listAgents(project.id)
      let orchestrator = agents.find((a) => a.role === 'orchestrator')
      if (!orchestrator) {
        orchestrator = await db.registerAgent({
          role: 'orchestrator',
          project_id: project.id,
          worktree_path: cwd,
          branch_name: defaultBranch,
        })
      } else {
        // Reset status to idle so the MCP marks it 'working' on next connect
        await db.updateAgentStatus(orchestrator.id, 'idle')
      }
      db.close()

      // 5. Ensure CLAUDE.md, .mcp.json and .worktrees/ are gitignored
      const gitignorePath = join(cwd, '.gitignore')
      const IGNORE_ENTRIES = ['CLAUDE.md', '.mcp.json', '.worktrees/']
      const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
      const missing = IGNORE_ENTRIES.filter((e) => !existing.split('\n').some((l) => l.trim() === e))
      if (missing.length) {
        const nl = existing.length && !existing.endsWith('\n') ? '\n' : ''
        writeFileSync(gitignorePath, existing + nl + '\n# AgentMesh\n' + missing.join('\n') + '\n')
      }

      // 6. Write CLAUDE.md + .mcp.json to the project directory
      const claudeMd = buildClaude('orchestrator', {
        AGENTMESH_AGENT_ID: orchestrator.id,
        PROJECT_NAME: project.name,
        WORKTREE_PATH: cwd,
        BRANCH_NAME: defaultBranch,
      })
      writeFileSync(join(cwd, 'CLAUDE.md'), claudeMd)

      const mcpBin = findMcpBin()
      const usesNode = mcpBin.endsWith('.js')
      const mcpConfig = {
        mcpServers: {
          agentmesh: {
            command: usesNode ? 'node' : mcpBin,
            ...(usesNode ? { args: [mcpBin] } : {}),
            env: {
              AGENTMESH_AGENT_ID: orchestrator.id,
              AGENTMESH_DB_PATH: dbPath,
            },
          },
        },
      }
      writeFileSync(join(cwd, '.mcp.json'), JSON.stringify(mcpConfig, null, 2))

      // 7. Launch web server with --open (opens browser once server is ready)
      const here = dirname(fileURLToPath(import.meta.url))
      const webBin = join(here, '..', '..', '..', 'web', 'dist', 'index.js')

      console.log()
      console.log('AgentMesh')
      console.log('  project     : ' + project.name)
      console.log('  orchestrator: ' + orchestrator.id.slice(0, 8))
      console.log('  url         : http://localhost:' + port)
      console.log()
      console.log('Run `claude` in this directory to start the orchestrator.')
      console.log()

      try {
        execFileSync(
          process.execPath,
          [webBin, '--project', project.id, '--port', String(port), '--open'],
          { stdio: 'inherit' },
        )
      } catch {
        // process exited — normal on Ctrl+C
      }
    })
}
