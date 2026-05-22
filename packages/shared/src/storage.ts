import type { Agent, AgentRole, AgentStatus, ConflictInfo, Event, Lock, Note, Project, Task, TaskStatus } from './types.js'

// Storage-layer input types

export interface CreateProjectInput {
  name: string
  description?: string
  repo_path: string
}

export interface RegisterAgentInput {
  role: AgentRole
  project_id: string
  worktree_path?: string
  branch_name?: string
}

export interface StorageCreateTaskInput {
  project_id: string
  sprint_id?: string
  title: string
  description: string
  acceptance_criteria: string
  role_required: AgentRole
  priority?: number
  estimated_effort?: string
  branch_name?: string
  depends_on?: string[]
}

export interface TaskFilter {
  project_id?: string
  status?: TaskStatus | TaskStatus[]
  role_required?: AgentRole
  assigned_agent_id?: string
  sprint_id?: string
}

export interface StorageAcquireLockInput {
  project_id: string
  paths: string[]
  agent_id: string
  task_id?: string
  ttl_minutes?: number
}

export interface StorageLeaveNoteInput {
  project_id: string
  from_agent_id: string
  to_agent_id?: string
  to_role?: AgentRole
  task_id?: string
  content: string
}

export interface LogEventInput {
  project_id?: string
  agent_id?: string
  event_type: string
  payload: unknown
}

export interface ClaimResult {
  success: boolean
  task: Task
  error?: string
  code?: string
}

export interface LockResult {
  success: boolean
  locks: Lock[]
  conflicts?: ConflictInfo[]
  error?: string
}

export interface StorageAdapter {
  // Projects
  createProject(input: CreateProjectInput): Promise<Project>
  getProject(id: string): Promise<Project | null>
  listProjects(): Promise<Project[]>

  // Agents
  registerAgent(input: RegisterAgentInput): Promise<Agent>
  getAgent(id: string): Promise<Agent | null>
  heartbeatAgent(id: string): Promise<void>
  updateAgentStatus(id: string, status: AgentStatus): Promise<void>
  listAgents(projectId: string): Promise<Agent[]>

  // Tasks
  createTask(input: StorageCreateTaskInput): Promise<Task>
  getTask(id: string): Promise<Task | null>
  listTasks(filter: TaskFilter): Promise<Task[]>
  claimTask(taskId: string, agentId: string): Promise<ClaimResult>
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    agentId: string,
    meta?: { notes?: string; pr_url?: string }
  ): Promise<Task>
  updateTaskDependencies(taskId: string, dependsOn: string[]): Promise<void>
  listUnmetDependencies(taskId: string): Promise<string[]>
  reassignTask(taskId: string, toAgentId: string): Promise<Task>
  cancelTask(taskId: string, reason: string): Promise<Task>

  // Locks
  acquireLock(input: StorageAcquireLockInput): Promise<LockResult>
  releaseLock(lockId: string, agentId: string): Promise<void>
  releaseLocksForTask(taskId: string): Promise<void>
  listLocks(projectId: string): Promise<Lock[]>
  pruneExpiredLocks(): Promise<number>

  // Notes
  leaveNote(input: StorageLeaveNoteInput): Promise<Note>
  getNotesForAgent(agentId: string, includeRead: boolean): Promise<Note[]>
  listNotes(projectId: string, filter?: { unread?: boolean; agentId?: string }): Promise<Note[]>
  markNoteRead(noteId: string): Promise<void>

  // Events
  logEvent(input: LogEventInput): Promise<void>
  listEvents(projectId: string, limit?: number): Promise<Event[]>
}
