import type { AgentRole } from '@agentmesh/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteAdapter } from './sqlite.js'

let db: SQLiteAdapter

beforeEach(() => {
  db = new SQLiteAdapter(':memory:')
})

afterEach(() => {
  db.close()
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function mkProject() {
  return db.createProject({ name: 'test-proj', repo_path: '/tmp/proj' })
}

async function mkAgent(projectId: string, role: AgentRole = 'backend') {
  return db.registerAgent({ role, project_id: projectId })
}

async function mkTask(projectId: string, role: AgentRole = 'backend', dependsOn?: string[]) {
  return db.createTask({
    project_id: projectId,
    title: 'Do something',
    description: 'desc',
    acceptance_criteria: 'tests pass',
    role_required: role,
    depends_on: dependsOn,
  })
}

// ── Projects ─────────────────────────────────────────────────────────────────

describe('projects', () => {
  it('creates and retrieves a project', async () => {
    const p = await mkProject()
    expect(p.name).toBe('test-proj')
    expect(p.status).toBe('active')
    const found = await db.getProject(p.id)
    expect(found?.id).toBe(p.id)
  })

  it('returns null for unknown project', async () => {
    expect(await db.getProject('nope')).toBeNull()
  })

  it('lists all projects', async () => {
    await db.createProject({ name: 'p1', repo_path: '/p1' })
    await db.createProject({ name: 'p2', repo_path: '/p2' })
    const list = await db.listProjects()
    expect(list).toHaveLength(2)
  })
})

// ── Agents ────────────────────────────────────────────────────────────────────

describe('agents', () => {
  it('registers an agent', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id)
    expect(a.role).toBe('backend')
    expect(a.status).toBe('idle')
  })

  it('updates heartbeat', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id)
    const before = a.last_heartbeat
    await new Promise((r) => setTimeout(r, 5))
    await db.heartbeatAgent(a.id)
    const agents = await db.listAgents(p.id)
    expect(agents[0]!.last_heartbeat).toBeGreaterThan(before)
  })

  it('updates agent status', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id)
    await db.updateAgentStatus(a.id, 'working')
    const agents = await db.listAgents(p.id)
    expect(agents[0]!.status).toBe('working')
  })
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe('tasks', () => {
  it('creates and retrieves a task', async () => {
    const p = await mkProject()
    const t = await mkTask(p.id)
    expect(t.status).toBe('backlog')
    expect(t.priority).toBe(3)
    const found = await db.getTask(t.id)
    expect(found?.id).toBe(t.id)
  })

  it('lists tasks with filter', async () => {
    const p = await mkProject()
    await mkTask(p.id, 'backend')
    await mkTask(p.id, 'frontend')
    const backendTasks = await db.listTasks({ project_id: p.id, role_required: 'backend' })
    expect(backendTasks).toHaveLength(1)
  })
})

// ── claimTask ─────────────────────────────────────────────────────────────────

describe('claimTask', () => {
  it('succeeds for matching role', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')
    const r = await db.claimTask(t.id, a.id)
    expect(r.success).toBe(true)
    expect(r.task.status).toBe('claimed')
    expect(r.task.assigned_agent_id).toBe(a.id)
  })

  it('is idempotent: same agent reclaims same task', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')
    await db.claimTask(t.id, a.id)
    const r2 = await db.claimTask(t.id, a.id)
    expect(r2.success).toBe(true)
  })

  it('second agent loses the race', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')

    const r1 = await db.claimTask(t.id, a1.id)
    const r2 = await db.claimTask(t.id, a2.id)

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(false)
    expect(r2.code).toBe('TASK_ALREADY_CLAIMED')
  })

  it('fails with ROLE_MISMATCH', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'frontend')
    const t = await mkTask(p.id, 'backend')
    const r = await db.claimTask(t.id, a.id)
    expect(r.success).toBe(false)
    expect(r.code).toBe('ROLE_MISMATCH')
  })

  it('fails with DEPS_NOT_MET when dependency not done', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const dep = await mkTask(p.id, 'backend')
    const t = await mkTask(p.id, 'backend', [dep.id])
    const r = await db.claimTask(t.id, a.id)
    expect(r.success).toBe(false)
    expect(r.code).toBe('DEPS_NOT_MET')
  })

  it('succeeds once dependency is done', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const dep = await mkTask(p.id, 'backend')
    const t = await mkTask(p.id, 'backend', [dep.id])

    await db.claimTask(dep.id, a.id)
    await db.updateTaskStatus(dep.id, 'done', a.id)

    const r = await db.claimTask(t.id, a.id)
    expect(r.success).toBe(true)
  })

  it('fails with TASK_NOT_FOUND for unknown id', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const r = await db.claimTask('ghost', a.id)
    expect(r.success).toBe(false)
    expect(r.code).toBe('TASK_NOT_FOUND')
  })
})

// ── updateTaskStatus ──────────────────────────────────────────────────────────

describe('updateTaskStatus', () => {
  it('transitions status', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')
    await db.claimTask(t.id, a.id)
    const updated = await db.updateTaskStatus(t.id, 'in_progress', a.id)
    expect(updated.status).toBe('in_progress')
  })

  it('done releases associated locks', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')
    await db.claimTask(t.id, a.id)
    await db.acquireLock({ project_id: p.id, paths: ['src/**'], agent_id: a.id, task_id: t.id })

    let locks = await db.listLocks(p.id)
    expect(locks).toHaveLength(1)

    await db.updateTaskStatus(t.id, 'done', a.id)
    locks = await db.listLocks(p.id)
    expect(locks).toHaveLength(0)
  })
})

// ── acquireLock ───────────────────────────────────────────────────────────────

describe('acquireLock', () => {
  it('acquires a lock', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const r = await db.acquireLock({ project_id: p.id, paths: ['src/api/**'], agent_id: a.id })
    expect(r.success).toBe(true)
    expect(r.locks).toHaveLength(1)
  })

  it('second agent cannot acquire overlapping lock', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'frontend')
    await db.acquireLock({ project_id: p.id, paths: ['src/api/**'], agent_id: a1.id })
    const r2 = await db.acquireLock({ project_id: p.id, paths: ['src/api/billing/**'], agent_id: a2.id })
    expect(r2.success).toBe(false)
    expect(r2.conflicts?.length).toBeGreaterThan(0)
  })

  it('non-overlapping locks both succeed', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'frontend')
    const r1 = await db.acquireLock({ project_id: p.id, paths: ['src/api/**'], agent_id: a1.id })
    const r2 = await db.acquireLock({ project_id: p.id, paths: ['src/frontend/**'], agent_id: a2.id })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
  })

  it('same agent can re-acquire its own paths', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    await db.acquireLock({ project_id: p.id, paths: ['src/api/**'], agent_id: a.id })
    const r2 = await db.acquireLock({ project_id: p.id, paths: ['src/api/**'], agent_id: a.id })
    expect(r2.success).toBe(true)
  })

  it('releaseLock removes the lock', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const r = await db.acquireLock({ project_id: p.id, paths: ['src/**'], agent_id: a.id })
    await db.releaseLock(r.locks[0]!.id, a.id)
    expect(await db.listLocks(p.id)).toHaveLength(0)
  })

  it('pruneExpiredLocks removes only expired ones', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    // Acquire with 0 TTL (immediately expired)
    await db.acquireLock({ project_id: p.id, paths: ['src/**'], agent_id: a.id, ttl_minutes: 0 })
    const pruned = await db.pruneExpiredLocks()
    expect(pruned).toBeGreaterThanOrEqual(1)
    expect(await db.listLocks(p.id)).toHaveLength(0)
  })
})

// ── Notes ─────────────────────────────────────────────────────────────────────

describe('notes', () => {
  it('leaves and retrieves a note', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'orchestrator')
    await db.leaveNote({ project_id: p.id, from_agent_id: a1.id, to_agent_id: a2.id, content: 'blocked!' })
    const notes = await db.getNotesForAgent(a2.id, false)
    expect(notes).toHaveLength(1)
    expect(notes[0]!.content).toBe('blocked!')
  })

  it('marks notes as read on retrieval', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    await db.leaveNote({ project_id: p.id, from_agent_id: a.id, to_agent_id: a.id, content: 'hi' })
    await db.getNotesForAgent(a.id, false)
    const second = await db.getNotesForAgent(a.id, false)
    expect(second).toHaveLength(0)
  })

  it('returns broadcast notes (to_agent_id = null)', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    await db.leaveNote({ project_id: p.id, from_agent_id: a.id, content: 'broadcast!' })
    const notes = await db.getNotesForAgent(a.id, false)
    expect(notes.some((n) => n.content === 'broadcast!')).toBe(true)
  })
})
