import type { Agent, Event, Lock, Project, Task } from '@agentmesh/shared'
import type { Command } from 'commander'
import type { SQLiteAdapter } from '@agentmesh/mcp-server'
import { openDb } from '../db.js'
import { relativeTime, section, tableStr, ts } from '../render.js'

const CLEAR = '\x1B[2J\x1B[0;0H'

interface StatusData {
  project: Project
  agents: Agent[]
  tasks: Task[]
  locks: Lock[]
  events: Event[]
}

async function fetchData(db: SQLiteAdapter, projectId: string): Promise<StatusData> {
  const [project, agents, tasks, locks, events] = await Promise.all([
    db.getProject(projectId),
    db.listAgents(projectId),
    db.listTasks({ project_id: projectId }),
    db.listLocks(projectId),
    db.listEvents(projectId, 10),
  ])
  if (!project) throw new Error(`Project not found: ${projectId}`)
  return { project, agents, tasks, locks, events }
}

function buildDashboard(data: StatusData, refreshedAt: Date): string {
  const { project, agents, tasks, locks, events } = data
  const lines: string[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  const title = `AgentMesh — ${project.name}`
  const stamp = refreshedAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
  lines.push(`${title.padEnd(50)}${stamp}`)
  lines.push('═'.repeat(Math.max(title.length + stamp.length + 2, 70)))

  // ── Agents ────────────────────────────────────────────────────────────────
  const activeAgents = agents.filter((a) => a.status !== 'offline')
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  const agentAssigned = new Map<string, Task>()
  for (const t of tasks) {
    if (t.assigned_agent_id && ['claimed', 'in_progress', 'blocked'].includes(t.status)) {
      agentAssigned.set(t.assigned_agent_id, t)
    }
  }

  lines.push(section(`AGENTS (${activeAgents.length} active / ${agents.length} total)`))
  lines.push(tableStr(
    agents.map((a) => {
      const currentTask = agentAssigned.get(a.id)
      const lastSeen = relativeTime(a.last_heartbeat)
      return {
        id: a.id.slice(0, 10),
        role: a.role,
        status: a.status,
        task: currentTask ? currentTask.title.slice(0, 35) : '',
        heartbeat: lastSeen,
        branch: a.branch_name ?? '',
      }
    }),
    ['id', 'role', 'status', 'task', 'heartbeat', 'branch']
  ))

  // ── Tasks by status ───────────────────────────────────────────────────────
  const taskStatusOrder = ['backlog', 'claimed', 'in_progress', 'blocked', 'review', 'done', 'cancelled'] as const
  const counts: Record<string, number> = {}
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1

  lines.push(section(`TASKS (${tasks.length} total)`))
  const countRows = taskStatusOrder
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => ({ status: s, count: String(counts[s] ?? 0) }))
  if (countRows.length === 0) {
    lines.push('  (no tasks)\n')
  } else {
    lines.push(tableStr(countRows, ['status', 'count']))
  }

  // ── Active locks ──────────────────────────────────────────────────────────
  const activeLocks = locks.filter((l) => l.expires_at > Date.now())
  lines.push(section(`ACTIVE LOCKS (${activeLocks.length})`))
  if (activeLocks.length === 0) {
    lines.push('  (none)\n')
  } else {
    lines.push(tableStr(
      activeLocks.map((l) => ({
        id: l.id.slice(0, 10),
        agent: l.agent_id.slice(0, 10),
        path: l.path_glob.slice(0, 40),
        task: l.task_id?.slice(0, 10) ?? '',
        expires: relativeTime(l.expires_at),
      })),
      ['id', 'agent', 'path', 'task', 'expires']
    ))
  }

  // ── Recent events ─────────────────────────────────────────────────────────
  lines.push(section('RECENT EVENTS (last 10)'))
  if (events.length === 0) {
    lines.push('  (none)\n')
  } else {
    for (const e of events) {
      const t = new Date(e.created_at).toISOString().slice(11, 19)
      const agent = e.agent_id ? `  [${e.agent_id.slice(0, 8)}]` : ''
      let detail = ''
      try {
        const p = e.payload as unknown as Record<string, unknown>
        if (p.task_id) detail = `  task:${String(p.task_id).slice(0, 8)}`
        if (p.paths) detail += `  paths:${JSON.stringify(p.paths).slice(0, 30)}`
      } catch { /* ignore */ }
      lines.push(`  ${t}  ${e.event_type.padEnd(22)}${agent}${detail}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function resolveProjectId(db: SQLiteAdapter, nameOrId?: string): Promise<string> {
  const projects = await db.listProjects()
  if (projects.length === 0) { console.error('No projects found.'); process.exit(1) }

  if (nameOrId) {
    const p = projects.find((x) => x.id === nameOrId || x.name === nameOrId)
    if (!p) { console.error(`Project not found: ${nameOrId}`); process.exit(1) }
    return p.id
  }

  if (projects.length === 1) return projects[0]!.id

  console.error('Multiple projects found. Specify --project <name_or_id>')
  console.error(projects.map((p) => `  ${p.name} (${p.id.slice(0, 10)})`).join('\n'))
  process.exit(1)
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show project dashboard')
    .option('--project <name_or_id>', 'Project to inspect')
    .option('--watch', 'Refresh every 2 seconds (Ctrl+C to exit)')
    .action(async (opts: { project?: string; watch?: boolean }) => {
      const db = openDb()
      const projectId = await resolveProjectId(db, opts.project)

      if (!opts.watch) {
        const data = await fetchData(db, projectId)
        db.close()
        process.stdout.write(buildDashboard(data, new Date()) + '\n')
        return
      }

      // Watch mode
      const draw = async () => {
        const data = await fetchData(db, projectId)
        process.stdout.write(CLEAR + buildDashboard(data, new Date()) + '\n')
        process.stdout.write('  Press Ctrl+C to exit\n')
      }

      await draw()
      const interval = setInterval(draw, 2000)

      process.on('SIGINT', () => {
        clearInterval(interval)
        db.close()
        process.stdout.write('\n')
        process.exit(0)
      })
    })
}
