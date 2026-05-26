import type { AgentRole } from '@agentmesh/shared'
import type { SQLiteAdapter } from '@agentmesh/mcp-server'
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function findAgentsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', '..', '..', 'agents'),
    join(process.cwd(), 'agents'),
  ]
  return candidates.find(existsSync) ?? join(process.cwd(), 'agents')
}

function buildClaude(role: string, vars: Record<string, string>): string {
  const dir = findAgentsDir()
  const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const raw = `${read(join(dir, '_common.md'))}\n---\n\n${read(join(dir, `${role}.md`)) || `## Role: ${role}\n`}`
  return raw.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`)
}

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

function findMcpBin(): string {
  const cmd = process.platform === 'win32' ? 'where agentmesh-mcp' : 'which agentmesh-mcp'
  try {
    const p = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0]!.trim()
    if (p) return 'agentmesh-mcp'
  } catch { /* not in PATH */ }
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', 'mcp-server', 'dist', 'index.js')
}

export interface SpawnOpts {
  role: AgentRole
  base_branch?: string
}

export interface SpawnResult {
  success: boolean
  agent?: { id: string; role: string; worktree_path: string; branch_name: string }
  error?: string
}

export async function spawnAgent(
  db: SQLiteAdapter,
  project: { id: string; name: string; repo_path: string },
  opts: SpawnOpts,
  dbPath: string,
): Promise<SpawnResult> {
  const repoPath = resolve(project.repo_path)

  try { execSync('git rev-parse --git-dir', { cwd: repoPath, stdio: 'pipe' }) }
  catch { return { success: false, error: `Not a git repository: ${repoPath}` } }

  const sid = Math.random().toString(36).slice(2, 8)
  const { role } = opts
  const baseBranch = opts.base_branch ?? detectDefaultBranch(repoPath)
  const branchName = `${role}/${sid}`
  const worktreeName = `${role}-${sid}`
  const worktreePath = resolve(repoPath, '.worktrees', worktreeName)

  try {
    execSync(`git worktree add -b "${branchName}" "${worktreePath}" "${baseBranch}"`, {
      cwd: repoPath, stdio: 'pipe',
    })
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim() ?? String(err)
    return { success: false, error: `Failed to create worktree: ${stderr}` }
  }

  const agent = await db.registerAgent({
    role,
    project_id: project.id,
    worktree_path: worktreePath,
    branch_name: branchName,
  })

  // Gitignore CLAUDE.md + .mcp.json so they can't be committed or accidentally restored
  const IGNORE_ENTRIES = ['CLAUDE.md', '.mcp.json', '.claude/', '_agent_loop.ps1', '_agent_hook.ps1', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  const wtGitignore = join(worktreePath, '.gitignore')
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
      console.warn(`Warning: no se pudo enlazar node_modules — ejecutá "npm install" en ${worktreePath}`)
    }
  }

  const claudeMd = buildClaude(role, {
    AGENTMESH_AGENT_ID: agent.id,
    ROLE: role,
    PROJECT_NAME: project.name,
    WORKTREE_PATH: worktreePath,
    BRANCH_NAME: branchName,
  })
  writeFileSync(join(worktreePath, 'CLAUDE.md'), claudeMd)

  const mcpBin = findMcpBin()
  const usesNode = mcpBin.endsWith('.js')
  const mcpConfig = {
    mcpServers: {
      agentmesh: {
        command: usesNode ? 'node' : mcpBin,
        ...(usesNode ? { args: [mcpBin] } : {}),
        env: { AGENTMESH_AGENT_ID: agent.id, AGENTMESH_DB_PATH: dbPath },
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

  // Auto-lanzar en Windows Terminal (nueva pestana) ejecutando el loop
  const loopScriptPath = join(worktreePath, '_agent_loop.ps1')
  try {
    spawn('wt', [
      'new-tab', '--title', role, '-d', worktreePath,
      'powershell', '-NoExit', '-File', loopScriptPath,
    ], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    try {
      spawn('powershell', [
        '-Command',
        `Start-Process powershell -ArgumentList '-NoExit -File "${loopScriptPath}"'`,
      ], { detached: true, stdio: 'ignore' }).unref()
    } catch { /* no disponible */ }
  }

  return {
    success: true,
    agent: { id: agent.id, role, worktree_path: worktreePath, branch_name: branchName },
  }
}
