import type { AgentRole } from '@agentmesh/shared'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteAdapter } from './sqlite.js'

let db: SQLiteAdapter

beforeEach(() => { db = new SQLiteAdapter(':memory:') })
afterEach(() => { db.close() })

// ── helpers ───────────────────────────────────────────────────────────────────

async function setup(agentCount: number, taskCount: number, role: AgentRole = 'backend') {
  const project = await db.createProject({ name: 'stress', repo_path: '/tmp' })

  const agents = await Promise.all(
    Array.from({ length: agentCount }, () => db.registerAgent({ role, project_id: project.id }))
  )

  const tasks = await Promise.all(
    Array.from({ length: taskCount }, (_, i) =>
      db.createTask({
        project_id: project.id,
        title: `Task ${i}`,
        description: 'd',
        acceptance_criteria: 'ac',
        role_required: role,
      })
    )
  )

  return { project, agents, tasks }
}

// ── 1. Race: N agents claim M tasks — each task claimed at most once ──────────

describe('claim race (10 agents × 100 tasks)', () => {
  it('every task is claimed by exactly one agent', async () => {
    const { agents, tasks } = await setup(10, 100)

    // All agents race to claim all tasks simultaneously
    const results = await Promise.all(
      agents.flatMap((agent) =>
        tasks.map((task) => db.claimTask(task.id, agent.id))
      )
    )

    const wins = results.filter((r) => r.success)
    const taskIds = wins.map((r) => r.task.id)
    const uniqueTaskIds = new Set(taskIds)

    // Each task must be claimed at most once
    expect(uniqueTaskIds.size).toBe(taskIds.length)
    // All 100 tasks must be claimed (10 agents × 10 tasks each = all go)
    expect(wins).toHaveLength(100)
  })

  it('winner and loser for same task are consistent', async () => {
    const { agents, tasks } = await setup(5, 1)
    const task = tasks[0]!

    const results = await Promise.all(
      agents.map((agent) => db.claimTask(task.id, agent.id))
    )

    const successes = results.filter((r) => r.success)
    const failures = results.filter((r) => !r.success)

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(4)
    // All failures must report the same error code
    expect(failures.every((r) => r.code === 'TASK_ALREADY_CLAIMED')).toBe(true)
    // All non-success results agree on the winner's assignment
    const winnerId = successes[0]!.task.assigned_agent_id
    expect(failures.every((r) => r.task.assigned_agent_id === winnerId)).toBe(true)
  })
})

// ── 2. Lock contention: overlapping vs non-overlapping paths ──────────────────

describe('lock contention (concurrent agents)', () => {
  it('10 agents acquire non-overlapping paths — all succeed', async () => {
    const { project, agents } = await setup(10, 1)

    const results = await Promise.all(
      agents.map((agent, i) =>
        db.acquireLock({
          project_id: project.id,
          paths: [`src/module-${i}/**`],
          agent_id: agent.id,
        })
      )
    )

    expect(results.every((r) => r.success)).toBe(true)
  })

  it('10 agents all targeting same path — only first succeeds', async () => {
    const { project, agents } = await setup(10, 1)

    const results = await Promise.all(
      agents.map((agent) =>
        db.acquireLock({
          project_id: project.id,
          paths: ['src/shared/**'],
          agent_id: agent.id,
        })
      )
    )

    const wins = results.filter((r) => r.success)
    const losses = results.filter((r) => !r.success)
    expect(wins).toHaveLength(1)
    expect(losses).toHaveLength(9)
    expect(losses.every((r) => (r.conflicts?.length ?? 0) > 0)).toBe(true)
  })

  it('lock released — next agent can acquire', async () => {
    const { project, agents } = await setup(2, 1)
    const [a1, a2] = agents as [typeof agents[0], typeof agents[0]]

    const r1 = await db.acquireLock({ project_id: project.id, paths: ['src/**'], agent_id: a1.id })
    expect(r1.success).toBe(true)

    // a2 fails while a1 holds the lock
    const r2before = await db.acquireLock({ project_id: project.id, paths: ['src/**'], agent_id: a2.id })
    expect(r2before.success).toBe(false)

    // a1 releases
    await db.releaseLock(r1.locks[0]!.id, a1.id)

    // a2 now succeeds
    const r2after = await db.acquireLock({ project_id: project.id, paths: ['src/**'], agent_id: a2.id })
    expect(r2after.success).toBe(true)
  })
})

// ── 3. Lock expiry and auto-cleanup ──────────────────────────────────────────

describe('lock expiry', () => {
  it('pruneExpiredLocks removes locks past TTL', async () => {
    const { project, agents } = await setup(1, 1)
    const agent = agents[0]!

    // Acquire a lock with 0-minute TTL (expires immediately)
    await db.acquireLock({
      project_id: project.id,
      paths: ['src/**'],
      agent_id: agent.id,
      ttl_minutes: 0,
    })

    // The lock is already expired; pruning should remove it
    const pruned = await db.pruneExpiredLocks()
    expect(pruned).toBeGreaterThanOrEqual(1)

    // Verify no active locks remain
    const remaining = await db.listLocks(project.id)
    expect(remaining.filter((l) => l.expires_at > Date.now())).toHaveLength(0)
  })

  it('after expiry, another agent can acquire the same path', async () => {
    const { project, agents } = await setup(2, 1)
    const [a1, a2] = agents as [typeof agents[0], typeof agents[0]]

    await db.acquireLock({ project_id: project.id, paths: ['src/**'], agent_id: a1.id, ttl_minutes: 0 })
    await db.pruneExpiredLocks()

    const r = await db.acquireLock({ project_id: project.id, paths: ['src/**'], agent_id: a2.id })
    expect(r.success).toBe(true)
  })

  it('pruneStaleData removes offline agents, expired locks, old events', async () => {
    const { project, agents } = await setup(2, 1)
    const [a1] = agents as [typeof agents[0]]

    // Stop agent (marks offline)
    await db.stopAgent(a1.id)

    // Acquire an already-expired lock for a2
    await db.acquireLock({
      project_id: project.id,
      paths: ['src/**'],
      agent_id: agents[1]!.id,
      ttl_minutes: 0,
    })

    // Prune with 0ms threshold (all offline agents and expired locks)
    const result = await db.pruneStaleData({ agentOfflineMs: 0, eventsOlderMs: 0 })
    expect(result.agents).toBeGreaterThanOrEqual(1)
    expect(result.locks).toBeGreaterThanOrEqual(1)
    expect(result.events).toBeGreaterThanOrEqual(1)
  })
})

// ── 4. Dependency chains under load ──────────────────────────────────────────

describe('dependency chain resolution', () => {
  it('chain of 10 sequential deps: only head is claimable', async () => {
    const { project, agents } = await setup(1, 1)
    const agent = agents[0]!

    // Create chain: t1 → t2 → t3 → ... → t10
    const chain: string[] = []
    for (let i = 0; i < 10; i++) {
      const t = await db.createTask({
        project_id: project.id,
        title: `Chain task ${i}`,
        description: 'd',
        acceptance_criteria: 'ac',
        role_required: 'backend',
        depends_on: chain.length > 0 ? [chain[chain.length - 1]!] : undefined,
      })
      chain.push(t.id)
    }

    // Only the first task (no deps) should be claimable
    const r0 = await db.claimTask(chain[0]!, agent.id)
    expect(r0.success).toBe(true)

    // The second task should block on unmet dependency
    const r1 = await db.claimTask(chain[1]!, agent.id)
    expect(r1.success).toBe(false)
    expect(r1.code).toBe('DEPS_NOT_MET')
  })

  it('completing a task unblocks the next in chain', async () => {
    const { project, agents } = await setup(1, 1)
    const agent = agents[0]!

    const t1 = await db.createTask({ project_id: project.id, title: 'T1', description: 'd', acceptance_criteria: 'ac', role_required: 'backend' })
    const t2 = await db.createTask({ project_id: project.id, title: 'T2', description: 'd', acceptance_criteria: 'ac', role_required: 'backend', depends_on: [t1.id] })

    await db.claimTask(t1.id, agent.id)
    await db.updateTaskStatus(t1.id, 'done', agent.id)

    const r = await db.claimTask(t2.id, agent.id)
    expect(r.success).toBe(true)
  })
})

// ── 5. MCP server state recovery ─────────────────────────────────────────────

describe('DB state persistence across server restarts', () => {
  it('state survives closing and reopening the adapter (same file)', async () => {
    const dbPath = join(tmpdir(), `agentmesh-test-${Date.now()}.sqlite`)
    const db1 = new SQLiteAdapter(dbPath)

    const p = await db1.createProject({ name: 'persist', repo_path: '/tmp' })
    const a = await db1.registerAgent({ role: 'backend', project_id: p.id })
    await db1.createTask({ project_id: p.id, title: 'T', description: 'd', acceptance_criteria: 'ac', role_required: 'backend' })
    db1.close()

    // Reopen — simulates MCP server crash + restart
    const db2 = new SQLiteAdapter(dbPath)
    const projects = await db2.listProjects()
    const agents = await db2.listAgents(p.id)
    const tasks = await db2.listTasks({ project_id: p.id })

    expect(projects).toHaveLength(1)
    expect(agents).toHaveLength(1)
    expect(tasks).toHaveLength(1)
    expect(agents[0]!.id).toBe(a.id)

    db2.close()
  })
})
