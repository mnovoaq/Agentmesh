import type { AgentRole } from '@agentmesh/shared'
import type { Command } from 'commander'
import { execSync, execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, readConfig } from '../db.js'

const VALID_ROLES: AgentRole[] = [
  'orchestrator', 'backend', 'frontend', 'integration',
  'qa', 'reviewer', 'release', 'scrum-master',
]

export function detectDefaultBranch(repoPath: string): string {
  for (const branch of ['main', 'master']) {
    try {
      execSync(`git rev-parse --verify ${branch}`, { cwd: repoPath, stdio: 'pipe' })
      return branch
    } catch { /* try next */ }
  }
  try {
    return execSync('git symbolic-ref --short HEAD', { cwd: repoPath, stdio: 'pipe', encoding: 'utf8' }).trim()
  } catch {
    return 'main'
  }
}

export function findAgentsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', '..', '..', '..', 'agents'),
    join(here, '..', '..', '..', 'agents'),
    join(process.cwd(), 'agents'),
  ]
  return candidates.find(existsSync) ?? join(process.cwd(), 'agents')
}

export function buildClaude(role: string, vars: Record<string, string>): string {
  const dir = findAgentsDir()
  const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const roleContent = read(join(dir, `${role}.md`)) || `## Role: ${role}\n`
  // Orchestrator has its own complete protocol — no worker common prefix
  const raw = role === 'orchestrator'
    ? roleContent
    : `${read(join(dir, '_common.md'))}\n---\n\n${roleContent}`
  return raw.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`)
}

export function findMcpBin(): string {
  try {
    const cmd = process.platform === 'win32' ? 'where agentmesh-mcp' : 'which agentmesh-mcp'
    const p = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0]!.trim()
    if (p) return 'agentmesh-mcp'
  } catch { /* not in PATH */ }
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', '..', 'mcp-server', 'dist', 'index.js')
}

function launchAgentTerminal(role: string, worktreePath: string): boolean {
  const loopScript = join(worktreePath, '_agent_loop.ps1')

  // Intenta abrir Windows Terminal con una nueva pestaña ejecutando el loop
  try {
    spawn('wt', [
      'new-tab',
      '--title', role,
      '-d', worktreePath,
      'powershell', '-NoExit', '-File', loopScript,
    ], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch { /* wt no disponible */ }

  // Fallback: nueva ventana PowerShell
  try {
    spawn('powershell', [
      '-Command',
      `Start-Process powershell -ArgumentList '-NoExit -File "${loopScript}"'`,
    ], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch { /* no disponible */ }

  return false
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn <role>')
    .description('Spawn an agent in a new git worktree')
    .requiredOption('--project <name_or_id>', 'Project name or id')
    .option('--branch <branch>', 'Branch name (default: <role>/<short_id>)')
    .option('--from <base>', 'Base branch to create from (default: auto-detected)')
    .action(async (role: string, opts: { project: string; branch?: string; from?: string }) => {
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

      // Auto-detect base branch if not specified
      const baseBranch = opts.from ?? detectDefaultBranch(repoPath)

      // Generate a short random suffix for naming before registering the agent
      const sid = Math.random().toString(36).slice(2, 8)
      const branchName = opts.branch ?? `${role}/${sid}`
      const worktreeName = `${role}-${sid}`
      const worktreePath = resolve(repoPath, '.worktrees', worktreeName)

      // Create worktree
      try {
        execSync(`git worktree add -b "${branchName}" "${worktreePath}" "${baseBranch}"`, {
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

      // Gitignore AgentMesh files y lockfiles en el worktree
      // Los lockfiles se regeneran al mergear — no se commitean por rama
      const wtGitignore = join(worktreePath, '.gitignore')
      const IGNORE_ENTRIES = ['CLAUDE.md', '.mcp.json', '.claude/', '_agent_loop.ps1', '_agent_hook.ps1', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
      const existing = existsSync(wtGitignore) ? readFileSync(wtGitignore, 'utf8') : ''
      const missing = IGNORE_ENTRIES.filter((e) => !existing.split('\n').some((l) => l.trim() === e))
      if (missing.length) {
        const nl = existing.length && !existing.endsWith('\n') ? '\n' : ''
        writeFileSync(wtGitignore, existing + nl + '\n# AgentMesh\n' + missing.join('\n') + '\n')
      }

      // Enlazar node_modules desde el repo principal al worktree
      const isWin = process.platform === 'win32'
      const src = join(repoPath, 'node_modules')
      const dst = join(worktreePath, 'node_modules')
      if (existsSync(src) && !existsSync(dst)) {
        let linked = false
        try {
          symlinkSync(src, dst, isWin ? 'junction' : 'dir')
          linked = true
        } catch {
          if (isWin) {
            try {
              execSync(`cmd /c mklink /J "${dst}" "${src}"`, { stdio: 'pipe' })
              linked = true
            } catch { /* will warn */ }
          }
        }
        if (!linked) {
          console.warn(`  Warning: no se pudo enlazar node_modules — ejecutá "npm install" en ${worktreePath}`)
        }
      }

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

      // Write _agent_hook.ps1 — captures Claude Code native tool calls and POSTs to web server
      const hookScriptPath = join(worktreePath, '_agent_hook.ps1')
      const hookScript = [
        `$agentId = '${agent.id}'`,
        '$raw = [Console]::In.ReadToEnd()',
        'try {',
        '    $d = $raw | ConvertFrom-Json -ErrorAction Stop',
        '    $tool = $d.tool_name',
        '    if (-not $tool) { exit 0 }',
        '    $skip = @("Read","Glob","Grep","LS","WebFetch","WebSearch","WebScreenshot","TodoRead","ListMcpServers","GetMcpServerList","NotebookRead")',
        '    if ($tool -in $skip) { exit 0 }',
        '    if ($tool -like "mcp__agentmesh__*") { exit 0 }',
        '    $portFile = Join-Path $env:USERPROFILE ".agentmesh\\web-port"',
        '    $port = if (Test-Path $portFile) { (Get-Content $portFile -Raw).Trim() } else { "4000" }',
        '    $body = [PSCustomObject]@{ agent_id = $agentId; tool_name = $tool; tool_input = $d.tool_input } | ConvertTo-Json -Compress -Depth 5',
        '    Invoke-RestMethod -Uri "http://localhost:$port/hook" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 2 | Out-Null',
        '} catch { }',
      ].join('\n')
      writeFileSync(hookScriptPath, hookScript)

      // Write .claude/settings.local.json — permite todos los comandos + hook de captura
      const claudeDir = join(worktreePath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify({
        permissions: { allow: ['Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'Glob', 'Grep'] },
        hooks: {
          PostToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: `powershell -NonInteractive -File "${hookScriptPath}"` }] }],
        },
      }, null, 2))

      // Write _agent_loop.ps1 — single-shot: el dispatcher se encarga de re-activar
      const loopScript = [
        '# AgentMesh — activacion single-shot (re-activado por el dispatcher)',
        '$ErrorActionPreference = "Continue"',
        `Set-Location "${worktreePath}"`,
        '$prompt = "Inicio de ciclo: get_notes y get_my_tasks. Reclamá y completá TODAS las tareas disponibles para tu rol, una por una. Cuando no queden más tareas disponibles para tu rol, terminá limpiamente sin hacer más llamadas MCP."',
        'claude --dangerously-skip-permissions -p $prompt',
        'Write-Host ""',
        'Write-Host "--- Ciclo completado. El dispatcher reactivará este worker cuando haya nuevo trabajo. ---"',
        'Start-Sleep -Seconds 3',
      ].join('\n')
      writeFileSync(join(worktreePath, '_agent_loop.ps1'), loopScript)

      db.close()

      console.log()
      console.log(`Agente lanzado: ${agent.id}`)
      console.log(`  rol       : ${role}`)
      console.log(`  proyecto  : ${project.name}`)
      console.log(`  branch    : ${branchName}`)
      console.log(`  worktree  : ${worktreePath}`)

      // Auto-lanzar en Windows Terminal (nueva pestaña) con --dangerously-skip-permissions
      const launched = launchAgentTerminal(role, worktreePath)
      if (launched) {
        console.log()
        console.log('Terminal abierta automáticamente con claude --dangerously-skip-permissions')
      } else {
        console.log()
        console.log('Para iniciar el agente manualmente:')
        console.log()
        console.log(`  cd "${worktreePath}"`)
        console.log(`  claude --dangerously-skip-permissions`)
      }
    })
}
