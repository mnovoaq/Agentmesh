import type { Command } from 'commander'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { openDb, readConfig } from '../db.js'

// How long to wait before re-activating the same role (avoids double-launch)
const GRACE_MS = 30_000
// How old a heartbeat can be before we consider the agent gone
const HEARTBEAT_STALE_MS = 5 * 60_000
// How long a task can sit in 'done' without being merged before notifying orchestrator
const PENDING_MERGE_WARN_MS = 10 * 60_000

const ACTIVATION_PROMPT =
  'Dispatcher cycle: get_notes y get_my_tasks. ' +
  'Reclamá y completá todas las tareas disponibles para tu rol. ' +
  'Cuando no queden más tareas disponibles, terminá el proceso limpiamente.'

function launchWorker(role: string, worktreePath: string): void {
  const loopScript = join(worktreePath, '_agent_loop.ps1')
  if (!existsSync(loopScript)) return

  // Try Windows Terminal first, fall back to new PowerShell window
  let launched = false
  try {
    spawn('wt', [
      'new-tab', '--title', role,
      '-d', worktreePath,
      'powershell', '-File', loopScript,
    ], { detached: true, stdio: 'ignore' }).unref()
    launched = true
  } catch { /* wt not available */ }

  if (!launched) {
    try {
      spawn('powershell', [
        '-Command',
        `Start-Process powershell -ArgumentList '-File "${loopScript}"'`,
      ], { detached: true, stdio: 'ignore' }).unref()
    } catch { /* ignore */ }
  }
}

export function registerDispatcher(program: Command): void {
  program
    .command('dispatcher')
    .description('Daemon that activates workers only when tasks are available — zero idle token burn')
    .requiredOption('--project <name_or_id>', 'Project name or id')
    .option('--interval <seconds>', 'Poll interval in seconds (default: 30)', '30')
    .action(async (opts: { project: string; interval: string }) => {
      const pollMs = Math.max(10, parseInt(opts.interval, 10)) * 1_000
      const config = readConfig()
      const dbPath = resolve(config.db_path.replace('~', homedir()))

      // Resolve project once — fail fast if not found
      const db = openDb(dbPath)
      const projects = await db.listProjects()
      const project = projects.find((p) => p.id === opts.project || p.name === opts.project)
      db.close()

      if (!project) {
        console.error(`Project not found: ${opts.project}`)
        process.exit(1)
      }

      console.log(`Dispatcher — proyecto: ${project.name}`)
      console.log(`Intervalo: ${pollMs / 1_000}s  |  Ctrl+C para detener\n`)

      // role -> timestamp of last launch
      const recentlyLaunched = new Map<string, number>()
      // task_id -> timestamp of last merge notification (avoids spamming orchestrator)
      const notifiedMergePending = new Map<string, number>()

      const poll = async () => {
        const db = openDb(dbPath)
        try {
          const [agents, backlogTasks, doneTasks] = await Promise.all([
            db.listAgents(project.id),
            db.listTasks({ project_id: project.id, status: 'backlog' }),
            db.listTasks({ project_id: project.id, status: 'done' }),
          ])

          const now = Date.now()

          // ── Activar workers para tareas en backlog ───────────────────────────
          if (backlogTasks.length > 0) {
            const rolesWithWork = new Set(backlogTasks.map((t) => t.role_required))

            for (const role of rolesWithWork) {
              const agent = agents.find((a) => a.role === role && a.worktree_path)
              if (!agent?.worktree_path) continue

              const heartbeatAge = now - agent.last_heartbeat
              if (agent.status === 'working' && heartbeatAge < HEARTBEAT_STALE_MS) continue

              const lastLaunch = recentlyLaunched.get(role) ?? 0
              if (now - lastLaunch < GRACE_MS) continue

              const taskCount = backlogTasks.filter((t) => t.role_required === role).length
              console.log(
                `[${new Date().toLocaleTimeString()}] Activando ${role} ` +
                `(${agent.id.slice(0, 8)}) — ${taskCount} tarea(s) disponible(s)`
              )

              recentlyLaunched.set(role, now)
              launchWorker(role, agent.worktree_path)
            }
          }

          // ── Notificar tareas done pendientes de merge ────────────────────────
          for (const task of doneTasks) {
            const completedAt = task.completed_at ?? task.updated_at
            if (now - completedAt < PENDING_MERGE_WARN_MS) continue  // demasiado reciente

            const lastNotified = notifiedMergePending.get(task.id) ?? 0
            if (now - lastNotified < 30 * 60_000) continue  // ya notificamos hace <30 min

            notifiedMergePending.set(task.id, now)
            console.log(`[${new Date().toLocaleTimeString()}] Tarea pendiente de merge: "${task.title}" (${task.id.slice(0, 8)})`)

            // Notificar al orquestador (best-effort)
            db.leaveNote({
              project_id: project.id,
              from_agent_id: null,
              to_role: 'orchestrator',
              content: `🔀 Tarea pendiente de merge hace ${Math.round((now - completedAt) / 60_000)} min:\n"${task.title}"\nBranch: ${task.branch_name ?? '(sin branch)'}\nEjecutá: agentmesh merge ${task.id} --auto`,
            }).catch(() => { /* best-effort */ })
          }
        } catch (err) {
          console.error('Poll error:', err instanceof Error ? err.message : err)
        } finally {
          db.close()
        }
      }

      // Run immediately, then on interval
      await poll()
      setInterval(poll, pollMs).unref()

      // Keep alive until Ctrl+C
      process.stdin.resume()
      process.on('SIGINT', () => {
        console.log('\nDispatcher detenido.')
        process.exit(0)
      })
    })
}
