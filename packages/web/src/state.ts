import type { Agent, Lock, Project, Task } from '@agentmesh/shared'
import type { SQLiteAdapter } from '@agentmesh/mcp-server'

export interface AgentWithTask extends Agent {
  current_task?: { id: string; title: string; status: string }
}

export interface ActivityItem {
  id: string
  type: 'note' | 'event'
  ts: number
  // notes
  from_id?: string | null
  from_role?: string
  to_id?: string | null
  to_role?: string | null
  content?: string
  // events
  event_type?: string
  agent_id?: string | null
  agent_role?: string
  detail?: string
}

export interface AppState {
  project: { id: string; name: string; status: string }
  agents: AgentWithTask[]
  tasks: { id: string; title: string; status: string; role_required: string }[]
  task_counts: Record<string, number>
  active_locks: (Lock & { agent_role?: string })[]
  activity: ActivityItem[]
}

const STATUS_ORDER = ['backlog', 'claimed', 'in_progress', 'blocked', 'review', 'done', 'cancelled'] as const

function eventDetail(eventType: string, payload: unknown, tasks: Task[]): string {
  try {
    const p = payload as Record<string, unknown>

    if (eventType.startsWith('hook:')) {
      const tool = eventType.slice(5)
      if (tool === 'Edit' || tool === 'Write') {
        const fp = p['file_path'] as string | undefined
        return fp ? (fp.split(/[/\\]/).pop() ?? fp) : ''
      }
      if (tool === 'MultiEdit') {
        const edits = p['edits'] as Array<{ file_path: string }> | undefined
        const fp = edits?.[0]?.file_path
        return fp ? (fp.split(/[/\\]/).pop() ?? fp) : ''
      }
      if (tool === 'Bash') {
        const cmd = (p['command'] as string | undefined) ?? ''
        return cmd.length > 48 ? cmd.slice(0, 48) + '…' : cmd
      }
      if (tool === 'TodoWrite') {
        const todos = p['todos'] as Array<unknown> | undefined
        return todos ? todos.length + ' TODOs' : ''
      }
      return ''
    }

    if (p['task_id']) {
      const t = tasks.find((x) => x.id === p['task_id'])
      const base = t ? '"' + t.title + '"' : String(p['task_id']).slice(0, 12)
      return p['status'] ? base + ' → ' + String(p['status']) : base
    }
    if (p['paths']) return (p['paths'] as string[]).join(', ')
    if (p['title']) return '"' + String(p['title']) + '"'
    if (p['lock_id']) return String(p['lock_id']).slice(0, 10)
  } catch { /* ignore */ }
  return ''
}

export async function buildState(db: SQLiteAdapter, projectId: string): Promise<AppState | null> {
  const project = await db.getProject(projectId)
  if (!project) return null

  const [agents, tasks, locks, notes, events] = await Promise.all([
    db.listAgents(projectId),
    db.listTasks({ project_id: projectId }),
    db.listLocks(projectId),
    db.listNotes(projectId),
    db.listEvents(projectId, 60),
  ])

  const agentRoles = new Map(agents.map((a) => [a.id, a.role]))

  // Map assigned tasks
  const tasksByAgent = new Map<string, Task>()
  for (const t of tasks) {
    if (t.assigned_agent_id && ['claimed', 'in_progress', 'blocked'].includes(t.status)) {
      tasksByAgent.set(t.assigned_agent_id, t)
    }
  }

  // Task counts
  const task_counts: Record<string, number> = {}
  for (const s of STATUS_ORDER) task_counts[s] = 0
  for (const t of tasks) task_counts[t.status] = (task_counts[t.status] ?? 0) + 1

  // Active locks with role
  const now = Date.now()
  const active_locks = locks
    .filter((l) => l.expires_at > now)
    .map((l) => ({ ...l, agent_role: agentRoles.get(l.agent_id) }))

  // Activity: merge notes + events, sort newest first
  const activity: ActivityItem[] = []

  for (const note of notes) {
    activity.push({
      id: 'note-' + note.id,
      type: 'note',
      ts: note.created_at,
      from_id: note.from_agent_id,
      from_role: note.from_agent_id ? agentRoles.get(note.from_agent_id) : undefined,
      to_id: note.to_agent_id,
      to_role: note.to_role ?? (note.to_agent_id ? agentRoles.get(note.to_agent_id) : 'broadcast'),
      content: note.content,
    })
  }

  for (const ev of events) {
    let payload: unknown
    try { payload = JSON.parse(ev.payload as unknown as string) } catch { payload = {} }
    activity.push({
      id: 'event-' + ev.id,
      type: 'event',
      ts: ev.created_at,
      event_type: ev.event_type,
      agent_id: ev.agent_id,
      agent_role: ev.agent_id ? agentRoles.get(ev.agent_id) : undefined,
      detail: eventDetail(ev.event_type, payload, tasks),
    })
  }

  activity.sort((a, b) => a.ts - b.ts) // oldest first — client appends to bottom

  return {
    project: { id: project.id, name: project.name, status: project.status },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      acceptance_criteria: t.acceptance_criteria,
      status: t.status,
      role_required: t.role_required,
      assigned_agent_id: t.assigned_agent_id ?? null,
      branch_name: t.branch_name ?? null,
      pr_url: t.pr_url ?? null,
    })),
    agents: agents.map((a) => {
      const ct = tasksByAgent.get(a.id)
      return { ...a, current_task: ct ? { id: ct.id, title: ct.title, status: ct.status } : undefined }
    }),
    task_counts,
    active_locks,
    activity: activity.slice(-60),
  }
}
