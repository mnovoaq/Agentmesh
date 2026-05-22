import type { AgentRole } from '@agentmesh/shared'
import type { Command } from 'commander'
import { execSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, readConfig } from '../db.js'

const VALID_ROLES: AgentRole[] = [
  'orchestrator', 'backend', 'frontend', 'integration',
  'qa', 'reviewer', 'release',
]

// Locate the agents/ template directory by walking up from this file.
function findAgentsDir(): string {
  // At runtime: packages/cli/dist/commands/spawn.js → go up 4 levels to monorepo root
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', '..', '..', '..', 'agents'),  // from dist/commands/
    join(here, '..', '..', '..', 'agents'),         // fallback
    join(process.cwd(), 'agents'),
  ]
  return candidates.find(existsSync) ?? join(process.cwd(), 'agents')
}

function buildClaude(role: string, vars: Record<string, string>): string {
  const dir = findAgentsDir()
  const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const raw = `${read(join(dir, '_common.md'))}\n---\n\n${read(join(dir, `${role}.md`)) || `## Rol: ${role}\n`}`
  return raw.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`)
}

function findMcpBin(): string {
  // Try the installed bin first; fall back to the built dist of the workspace package.
  try {
    const p = execSync('which agentmesh-mcp 2>nul || where agentmesh-mcp 2>nul', { encoding: 'utf8', stdio: 'pipe' }).trim()
    if (p) return 'agentmesh-mcp'
  } catch { /* not in PATH */ }

  const here = dirname(fileURLToPath(import.meta.url))
  // packages/cli/dist/commands → packages/mcp-server/dist/index.js
  return join(here, '..', '..', '..', 'mcp-server', 'dist', 'index.js')
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn <role>')
    .description('Spawn an agent in a new git worktree')
    .requiredOption('--project <name_or_id>', 'Project name or id')
    .option('--branch <branch>', 'Branch name (default: <role>/<short_id>)')
    .option('--from <base>', 'Base branch to create from', 'main')
    .action(async (role: string, opts: { project: string; branch?: string; from: string }) => {
      if (!VALID_ROLES.includes(role as AgentRole)) {
        console.error(`Unknown role: ${role}. Valid: ${VALID_ROLES.join(', ')}`)
        process.exit(1)
      }

      const db = openDb()
      const config = readConfig()
      const dbPath = resolve(config.db_path.replace('~', homedir()))

      // Resolve project
      const projects = await db.listProjects()
      const project = projects.find((p) => p.id === opts.project || p.name === opts.project)
      if (!project) { db.close(); console.error(`Project not found: ${opts.project}`); process.exit(1) }

      const repoPath = resolve(project.repo_path)

      // Verify git repo
      try { execSync('git rev-parse --git-dir', { cwd: repoPath, stdio: 'pipe' }) }
      catch { db.close(); console.error(`Not a git repository: ${repoPath}`); process.exit(1) }

      // Generate a short random suffix for naming before registering the agent
      const sid = Math.random().toString(36).slice(2, 8)
      const branchName = opts.branch ?? `${role}/${sid}`
      const worktreeName = `${project.name.replace(/[\s/\\]+/g, '-')}-${role}-${sid}`
      const worktreePath = resolve(repoPath, '..', worktreeName)

      // Create worktree
      try {
        execSync(`git worktree add -b "${branchName}" "${worktreePath}" "${opts.from}"`, {
          cwd: repoPath, stdio: 'pipe',
        })
      } catch (err) {
        db.close()
        const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim() ?? String(err)
        console.error(`Failed to create worktree:\n  ${stderr}`)
        process.exit(1)
      }

      // Register agent (now that we have the final paths)
      const agent = await db.registerAgent({
        role: role as AgentRole,
        project_id: project.id,
        worktree_path: worktreePath,
        branch_name: branchName,
      })

      // Write CLAUDE.md
      const claudeMd = buildClaude(role, {
        AGENTMESH_AGENT_ID: agent.id,
        ROLE: role,
        PROJECT_NAME: project.name,
        WORKTREE_PATH: worktreePath,
        BRANCH_NAME: branchName,
      })
      writeFileSync(join(worktreePath, 'CLAUDE.md'), claudeMd)

      // Write .mcp.json
      const mcpBin = findMcpBin()
      const usesNode = mcpBin.endsWith('.js')
      const mcpConfig = {
        mcpServers: {
          agentmesh: {
            command: usesNode ? 'node' : mcpBin,
            ...(usesNode ? { args: [mcpBin] } : {}),
            env: {
              AGENTMESH_AGENT_ID: agent.id,
              AGENTMESH_DB_PATH: dbPath,
            },
          },
        },
      }
      writeFileSync(join(worktreePath, '.mcp.json'), JSON.stringify(mcpConfig, null, 2))

      db.close()

      console.log()
      console.log(`Agent spawned: ${agent.id}`)
      console.log(`  role      : ${role}`)
      console.log(`  project   : ${project.name}`)
      console.log(`  branch    : ${branchName}`)
      console.log(`  worktree  : ${worktreePath}`)
      console.log()
      console.log('To start Claude Code in this worktree:')
      console.log()
      console.log(`  claude "${worktreePath}"`)
      console.log()
      console.log('The .mcp.json is pre-configured with your agent ID.')
    })
}
