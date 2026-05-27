import type {
  Agent,
  AgentRole,
  AgentStatus,
  ConflictInfo,
  EffortSize,
  Event,
  Lock,
  Note,
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
} from '@agentmesh/shared'
import type {
  ClaimResult,
  CreateProjectInput,
  LogEventInput,
  LockResult,
  RegisterAgentInput,
  StorageAcquireLockInput,
  StorageAdapter,
  StorageCreateTaskInput,
  StorageLeaveNoteInput,
  TaskFilter,
} from '@agentmesh/shared'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { globsConflict } from '../logic/lock-conflict.js'
import { applyMigration } from './migrate.js'

// Raw row shapes returned by better-sqlite3
interface ProjectRow { id: string; name: string; description: string | null; repo_path: string; status: string; created_at: number; updated_at: number }
interface AgentRow { id: string; role: string; project_id: string; worktree_path: string | null; branch_name: string | null; status: string; last_heartbeat: number; spawned_at: number }
interface TaskRow { id: string; project_id: string; sprint_id: string | null; title: string; description: string; acceptance_criteria: string; role_required: string; status: string; assigned_agent_id: string | null; priority: number; estimated_effort: string | null; branch_name: string | null; pr_url: string | null; created_at: number; updated_at: number; completed_at: number | null }
interface LockRow { id: string; project_id: string; path_glob: string; agent_id: string; task_id: string | null; acquired_at: number; expires_at: number }
interface NoteRow { id: string; project_id: string; from_agent_id: string | null; to_agent_id: string | null; to_role: string | null; task_id: string | null; content: string; read: number; created_at: number }
interface EventRow { id: string; project_id: string | null; agent_id: string | null; event_type: string; payload: string; created_at: number }

function mapProject(r: ProjectRow): Project {
  return { ...r, status: r.status as ProjectStatus }
}

function mapAgent(r: AgentRow): Agent {
  return { ...r, role: r.role as AgentRole, status: r.status as AgentStatus }
}

function mapTask(r: TaskRow): Task {
  return {
    ...r,
    role_required: r.role_required as AgentRole,
    status: r.status as TaskStatus,
    estimated_effort: r.estimated_effort as EffortSize | null,
  }
}

function mapLock(r: LockRow): Lock { return r }

function mapNote(r: NoteRow): Note {
  return { ...r, read: r.read === 1 }
}

function mapEvent(r: EventRow): Event { return r }

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    applyMigration(this.db)
  }

  close(): void {
    this.db.close()
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  createProject(input: CreateProjectInput): Promise<Project> {
    const now = Date.now()
    const id = nanoid()
    this.db.prepare(
      'INSERT INTO projects (id, name, description, repo_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.name, input.description ?? null, input.repo_path, 'active', now, now)
    return Promise.resolve(this.getProjectSync(id)!)
  }

  getProject(id: string): Promise<Project | null> {
    return Promise.resolve(this.getProjectSync(id))
  }

  listProjects(): Promise<Project[]> {
    const rows = this.db.prepare<[], ProjectRow>('SELECT * FROM projects ORDER BY created_at DESC').all()
    return Promise.resolve(rows.map(mapProject))
  }

  private getProjectSync(id: string): Project | null {
    const row = this.db.prepare<[string], ProjectRow>('SELECT * FROM projects WHERE id = ?').get(id)
    return row ? mapProject(row) : null
  }

  // ── Agents ──────────────────────────────────────────────────────────────────

  registerAgent(input: RegisterAgentInput): Promise<Agent> {
    const now = Date.now()
    const id = nanoid()
    this.db.prepare(
      'INSERT INTO agents (id, role, project_id, worktree_path, branch_name, status, last_heartbeat, spawned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.role, input.project_id, input.worktree_path ?? null, input.branch_name ?? null, 'idle', now, now)
    return Promise.resolve(this.getAgentSync(id)!)
  }

  getAgent(id: string): Promise<Agent | null> {
    return Promise.resolve(this.getAgentSync(id))
  }

  heartbeatAgent(id: string): Promise<void> {
    this.db.prepare('UPDATE agents SET last_heartbeat = ? WHERE id = ?').run(Date.now(), id)
    return Promise.resolve()
  }

  updateAgentStatus(id: string, status: AgentStatus): Promise<void> {
    this.db.prepare('UPDATE agents SET status = ?, last_heartbeat = ? WHERE id = ?').run(status, Date.now(), id)
    return Promise.resolve()
  }

  listAgents(projectId: string): Promise<Agent[]> {
    const rows = this.db.prepare<[string], AgentRow>('SELECT * FROM agents WHERE project_id = ?').all(projectId)
    return Promise.resolve(rows.map(mapAgent))
  }

  private getAgentSync(id: string): Agent | null {
    const row = this.db.prepare<[string], AgentRow>('SELECT * FROM agents WHERE id = ?').get(id)
    return row ? mapAgent(row) : null
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────

  createTask(input: StorageCreateTaskInput): Promise<Task> {
    const now = Date.now()
    const id = nanoid()
    this.db.prepare(`
      INSERT INTO tasks (id, project_id, sprint_id, title, description, acceptance_criteria, role_required, status, priority, estimated_effort, branch_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.sprint_id ?? null, input.title, input.description, input.acceptance_criteria, input.role_required, input.priority ?? 3, input.estimated_effort ?? null, input.branch_name ?? null, now, now)

    if (input.depends_on?.length) {
      const insertDep = this.db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)')
      for (const dep of input.depends_on) {
        insertDep.run(id, dep)
      }
    }

    this.logEventSync({ project_id: input.project_id, event_type: 'task.created', payload: { task_id: id } })
    return Promise.resolve(this.getTaskSync(id)!)
  }

  getTask(id: string): Promise<Task | null> {
    return Promise.resolve(this.getTaskSync(id))
  }

  listTasks(filter: TaskFilter): Promise<Task[]> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter.project_id) { conditions.push('project_id = ?'); params.push(filter.project_id) }
    if (filter.role_required) { conditions.push('role_required = ?'); params.push(filter.role_required) }
    if (filter.assigned_agent_id) { conditions.push('assigned_agent_id = ?'); params.push(filter.assigned_agent_id) }
    if (filter.sprint_id) { conditions.push('sprint_id = ?'); params.push(filter.sprint_id) }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      conditions.push(`status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db.prepare<unknown[], TaskRow>(`SELECT * FROM tasks ${where} ORDER BY priority ASC, created_at ASC`).all(...params)
    return Promise.resolve(rows.map(mapTask))
  }

  claimTask(taskId: string, agentId: string): Promise<ClaimResult> {
    const result = this.db.transaction((): ClaimResult => {
      const task = this.db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE id = ?').get(taskId)
      if (!task) return { success: false, task: null as unknown as Task, error: 'Task not found', code: 'TASK_NOT_FOUND' }

      // Idempotent: same agent already has it
      if ((task.status === 'claimed' || task.status === 'in_progress') && task.assigned_agent_id === agentId) {
        return { success: true, task: mapTask(task) }
      }

      if (task.status === 'claimed' || task.status === 'in_progress') {
        return { success: false, task: mapTask(task), error: 'Task already claimed by another agent', code: 'TASK_ALREADY_CLAIMED' }
      }

      if (task.status !== 'backlog') {
        return { success: false, task: mapTask(task), error: `Cannot claim task with status: ${task.status}`, code: 'INVALID_STATUS' }
      }

      const agent = this.db.prepare<[string], AgentRow>('SELECT * FROM agents WHERE id = ?').get(agentId)
      if (!agent) return { success: false, task: mapTask(task), error: 'Agent not found', code: 'AGENT_NOT_FOUND' }

      if (agent.role !== task.role_required) {
        return { success: false, task: mapTask(task), error: `Role mismatch: agent=${agent.role}, required=${task.role_required}`, code: 'ROLE_MISMATCH' }
      }

      const deps = this.db.prepare<[string], { status: string }>(`
        SELECT t.status FROM task_dependencies td
        JOIN tasks t ON t.id = td.depends_on_task_id
        WHERE td.task_id = ?
      `).all(taskId)

      const unmet = deps.filter((d) => d.status !== 'done')
      if (unmet.length > 0) {
        return { success: false, task: mapTask(task), error: `${unmet.length} dependency(ies) not done`, code: 'DEPS_NOT_MET' }
      }

      const now = Date.now()
      this.db.prepare('UPDATE tasks SET status = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?').run('claimed', agentId, now, taskId)
      this.logEventSync({ project_id: task.project_id, agent_id: agentId, event_type: 'task.claimed', payload: { task_id: taskId } })

      return { success: true, task: mapTask(this.db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE id = ?').get(taskId)!) }
    })()

    return Promise.resolve(result)
  }

  updateTaskStatus(taskId: string, status: TaskStatus, agentId: string, meta?: { notes?: string; pr_url?: string }): Promise<Task> {
    const now = Date.now()
    const completedAt = status === 'done' ? now : null

    this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at),
      pr_url = COALESCE(?, pr_url) WHERE id = ? AND assigned_agent_id = ?
    `).run(status, now, completedAt, meta?.pr_url ?? null, taskId, agentId)

    if (status === 'done') {
      this.db.prepare('DELETE FROM locks WHERE task_id = ?').run(taskId)
    }

    this.logEventSync({ agent_id: agentId, event_type: `task.${status}`, payload: { task_id: taskId, notes: meta?.notes } })
    return Promise.resolve(this.getTaskSync(taskId)!)
  }

  forceUpdateTaskStatus(taskId: string, status: TaskStatus, meta?: { notes?: string; pr_url?: string }): Promise<Task> {
    const now = Date.now()
    const completedAt = status === 'done' ? now : null
    this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at),
      pr_url = COALESCE(?, pr_url) WHERE id = ?
    `).run(status, now, completedAt, meta?.pr_url ?? null, taskId)
    if (status === 'done') {
      this.db.prepare('DELETE FROM locks WHERE task_id = ?').run(taskId)
    }
    this.logEventSync({ event_type: `task.force_${status}`, payload: { task_id: taskId, notes: meta?.notes } })
    return Promise.resolve(this.getTaskSync(taskId)!)
  }

  findNowUnblockedDownstream(taskId: string, projectId: string): Promise<Task[]> {
    const rows = this.db.prepare<[string, string], TaskRow>(`
      SELECT t.* FROM task_dependencies td
      JOIN tasks t ON t.id = td.task_id
      WHERE td.depends_on_task_id = ? AND t.project_id = ? AND t.status = 'backlog'
      AND NOT EXISTS (
        SELECT 1 FROM task_dependencies td2
        JOIN tasks dep ON dep.id = td2.depends_on_task_id
        WHERE td2.task_id = t.id AND dep.status != 'done'
      )
    `).all(taskId, projectId)
    return Promise.resolve(rows.map(mapTask))
  }

  listUnmetDependencies(taskId: string): Promise<string[]> {
    const rows = this.db.prepare<[string], { id: string }>(`
      SELECT t.id FROM task_dependencies td
      JOIN tasks t ON t.id = td.depends_on_task_id
      WHERE td.task_id = ? AND t.status != 'done'
    `).all(taskId)
    return Promise.resolve(rows.map((r) => r.id))
  }

  updateTaskDependencies(taskId: string, dependsOn: string[]): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM task_dependencies WHERE task_id = ?').run(taskId)
      const insert = this.db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)')
      for (const dep of dependsOn) insert.run(taskId, dep)
    })()
    return Promise.resolve()
  }

  reassignTask(taskId: string, toAgentId: string): Promise<Task> {
    const now = Date.now()
    this.db.prepare('UPDATE tasks SET assigned_agent_id = ?, updated_at = ? WHERE id = ?').run(toAgentId, now, taskId)
    this.logEventSync({ event_type: 'task.reassigned', payload: { task_id: taskId, to_agent_id: toAgentId } })
    return Promise.resolve(this.getTaskSync(taskId)!)
  }

  cancelTask(taskId: string, reason: string): Promise<Task> {
    const now = Date.now()
    this.db.prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, taskId)
    this.logEventSync({ event_type: 'task.cancelled', payload: { task_id: taskId, reason } })
    return Promise.resolve(this.getTaskSync(taskId)!)
  }

  private getTaskSync(id: string): Task | null {
    const row = this.db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? mapTask(row) : null
  }

  // ── Locks ───────────────────────────────────────────────────────────────────

  acquireLock(input: StorageAcquireLockInput): Promise<LockResult> {
    const result = this.db.transaction((): LockResult => {
      const now = Date.now()
      const existing = this.db.prepare<[string, number], LockRow>(
        'SELECT * FROM locks WHERE project_id = ? AND expires_at > ?'
      ).all(input.project_id, now)

      const conflicts: ConflictInfo[] = []
      for (const lock of existing) {
        if (lock.agent_id === input.agent_id) continue
        for (const path of input.paths) {
          if (globsConflict(path, lock.path_glob)) {
            conflicts.push({ path, conflicting_agent_id: lock.agent_id, conflicting_lock_id: lock.id })
          }
        }
      }

      if (conflicts.length > 0) return { success: false, locks: [], conflicts }

      const ttlMs = (input.ttl_minutes ?? 120) * 60 * 1000
      const created: Lock[] = []

      for (const path of input.paths) {
        const id = nanoid()
        this.db.prepare(
          'INSERT INTO locks (id, project_id, path_glob, agent_id, task_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, input.project_id, path, input.agent_id, input.task_id ?? null, now, now + ttlMs)
        created.push({ id, project_id: input.project_id, path_glob: path, agent_id: input.agent_id, task_id: input.task_id ?? null, acquired_at: now, expires_at: now + ttlMs })
      }

      this.logEventSync({ project_id: input.project_id, agent_id: input.agent_id, event_type: 'lock.acquired', payload: { paths: input.paths } })
      return { success: true, locks: created }
    })()

    return Promise.resolve(result)
  }

  releaseLock(lockId: string, agentId: string): Promise<void> {
    this.db.prepare('DELETE FROM locks WHERE id = ? AND agent_id = ?').run(lockId, agentId)
    this.logEventSync({ agent_id: agentId, event_type: 'lock.released', payload: { lock_id: lockId } })
    return Promise.resolve()
  }

  releaseLocksForTask(taskId: string): Promise<void> {
    this.db.prepare('DELETE FROM locks WHERE task_id = ?').run(taskId)
    return Promise.resolve()
  }

  listLocks(projectId: string): Promise<Lock[]> {
    const rows = this.db.prepare<[string], LockRow>('SELECT * FROM locks WHERE project_id = ?').all(projectId)
    return Promise.resolve(rows.map(mapLock))
  }

  pruneExpiredLocks(): Promise<number> {
    const result = this.db.prepare('DELETE FROM locks WHERE expires_at <= ?').run(Date.now())
    return Promise.resolve(result.changes)
  }

  // ── Notes ───────────────────────────────────────────────────────────────────

  leaveNote(input: StorageLeaveNoteInput): Promise<Note> {
    const id = nanoid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO notes (id, project_id, from_agent_id, to_agent_id, to_role, task_id, content, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, input.project_id, input.from_agent_id, input.to_agent_id ?? null, input.to_role ?? null, input.task_id ?? null, input.content, now)
    const row = this.db.prepare<[string], NoteRow>('SELECT * FROM notes WHERE id = ?').get(id)!
    return Promise.resolve(mapNote(row))
  }

  getNotesForAgent(agentId: string, includeRead: boolean): Promise<Note[]> {
    const readCondition = includeRead ? '' : 'AND read = 0'
    const rows = this.db.prepare<[string], NoteRow>(`
      SELECT * FROM notes
      WHERE (to_agent_id = ? OR to_agent_id IS NULL)
      ${readCondition}
      ORDER BY created_at ASC
    `).all(agentId)

    // Mark returned notes as read
    if (rows.length > 0) {
      const ids = rows.map((r) => `'${r.id}'`).join(',')
      this.db.prepare(`UPDATE notes SET read = 1 WHERE id IN (${ids})`).run()
    }

    return Promise.resolve(rows.map(mapNote))
  }

  listNotes(projectId: string, filter?: { unread?: boolean; agentId?: string }): Promise<Note[]> {
    const conditions: string[] = ['project_id = ?']
    const params: unknown[] = [projectId]

    if (filter?.unread) { conditions.push('read = 0') }
    if (filter?.agentId) { conditions.push('(to_agent_id = ? OR to_agent_id IS NULL)'); params.push(filter.agentId) }

    const rows = this.db.prepare<unknown[], NoteRow>(
      `SELECT * FROM notes WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`
    ).all(...params)
    return Promise.resolve(rows.map(mapNote))
  }

  markNoteRead(noteId: string): Promise<void> {
    this.db.prepare('UPDATE notes SET read = 1 WHERE id = ?').run(noteId)
    return Promise.resolve()
  }

  // ── Agent lifecycle ─────────────────────────────────────────────────────────

  stopAgent(agentId: string): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare("UPDATE agents SET status = 'offline', last_heartbeat = ? WHERE id = ?").run(Date.now(), agentId)
      // Release all locks held by this agent
      this.db.prepare('DELETE FROM locks WHERE agent_id = ?').run(agentId)
      // Unassign in_progress / claimed tasks back to backlog
      this.db.prepare(
        "UPDATE tasks SET status = 'backlog', assigned_agent_id = NULL, updated_at = ? WHERE assigned_agent_id = ? AND status IN ('claimed','in_progress')"
      ).run(Date.now(), agentId)
    })()
    this.logEventSync({ agent_id: agentId, event_type: 'agent.stopped', payload: { agent_id: agentId } })
    return Promise.resolve()
  }

  releaseLocksForAgent(agentId: string): Promise<void> {
    this.db.prepare('DELETE FROM locks WHERE agent_id = ?').run(agentId)
    return Promise.resolve()
  }

  // ── Maintenance ─────────────────────────────────────────────────────────────

  pruneStaleData(opts?: { agentOfflineMs?: number; eventsOlderMs?: number }): Promise<{ agents: number; locks: number; events: number }> {
    const now = Date.now()
    const agentCutoff = now - (opts?.agentOfflineMs ?? 24 * 60 * 60 * 1000)
    const eventCutoff = now - (opts?.eventsOlderMs ?? 30 * 24 * 60 * 60 * 1000)

    const agents = this.db.prepare(
      "DELETE FROM agents WHERE status = 'offline' AND last_heartbeat < ?"
    ).run(agentCutoff).changes

    const locks = this.db.prepare('DELETE FROM locks WHERE expires_at <= ?').run(now).changes

    const events = this.db.prepare('DELETE FROM events WHERE created_at < ?').run(eventCutoff).changes

    return Promise.resolve({ agents, locks, events })
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  logEvent(input: LogEventInput): Promise<void> {
    this.logEventSync(input)
    return Promise.resolve()
  }

  listEvents(projectId: string, limit = 20): Promise<Event[]> {
    const rows = this.db.prepare<[string, number], EventRow>(
      'SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(projectId, limit)
    return Promise.resolve(rows.map(mapEvent))
  }

  private logEventSync(input: LogEventInput): void {
    this.db.prepare(
      'INSERT INTO events (id, project_id, agent_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(nanoid(), input.project_id ?? null, input.agent_id ?? null, input.event_type, JSON.stringify(input.payload), Date.now())
  }
}
