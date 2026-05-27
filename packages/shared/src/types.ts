// Domain entities and enums for AgentMesh

export type ProjectStatus = 'active' | 'paused' | 'archived'
export type SprintStatus = 'active' | 'done' | 'cancelled'
export type AgentRole = 'orchestrator' | 'backend' | 'frontend' | 'qa' | 'reviewer' | 'release' | 'integration' | 'scrum-master'
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'offline'
export type TaskStatus = 'backlog' | 'claimed' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled'
export type EffortSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export interface Project {
  id: string
  name: string
  description: string | null
  repo_path: string
  status: ProjectStatus
  created_at: number
  updated_at: number
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  status: SprintStatus
  created_at: number
}

export interface Agent {
  id: string
  role: AgentRole
  project_id: string
  worktree_path: string | null
  branch_name: string | null
  status: AgentStatus
  last_heartbeat: number
  spawned_at: number
}

export interface Task {
  id: string
  project_id: string
  sprint_id: string | null
  title: string
  description: string
  acceptance_criteria: string
  role_required: AgentRole
  status: TaskStatus
  assigned_agent_id: string | null
  priority: number
  estimated_effort: EffortSize | null
  branch_name: string | null
  pr_url: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

export interface TaskDependency {
  task_id: string
  depends_on_task_id: string
}

export interface Lock {
  id: string
  project_id: string
  path_glob: string
  agent_id: string
  task_id: string | null
  acquired_at: number
  expires_at: number
}

export interface Note {
  id: string
  project_id: string
  from_agent_id: string | null
  to_agent_id: string | null
  to_role: string | null
  task_id: string | null
  content: string
  read: boolean
  created_at: number
}

export interface Event {
  id: string
  project_id: string | null
  agent_id: string | null
  event_type: string
  payload: string
  created_at: number
}

export interface ConflictInfo {
  path: string
  conflicting_agent_id: string
  conflicting_lock_id: string
}

export interface AgentSummary {
  id: string
  role: AgentRole
  status: AgentStatus
  current_task_id: string | null
  last_heartbeat: number
}
