import type { AgentRole } from '@agentmesh/shared'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentMeshServer } from './server.js'
import { SQLiteAdapter } from './storage/sqlite.js'

// ── helpers ──────────────────────────────────────────────────────────────────

let db: SQLiteAdapter

beforeEach(() => { db = new SQLiteAdapter(':memory:') })
afterEach(() => { db.close() })

async function mkProject() {
  return db.createProject({ name: 'test', repo_path: '/tmp' })
}

async function mkAgent(projectId: string, role: AgentRole = 'backend') {
  return db.registerAgent({ role, project_id: projectId })
}

async function mkTask(projectId: string, role: AgentRole = 'backend') {
  return db.createTask({ project_id: projectId, title: 'Task', description: 'desc', acceptance_criteria: 'ac', role_required: role })
}

async function makeClient(agentId: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair()
  const server = createAgentMeshServer(db, agentId)
  await server.connect(st)
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} })
  await client.connect(ct)
  return { client, server }
}

function parseResult(result: unknown): unknown {
  const r = result as { content: { text: string }[] }
  return JSON.parse(r.content[0]!.text)
}

// ── tool listing ──────────────────────────────────────────────────────────────

describe('server setup', () => {
  it('lists all 9 worker tools', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id)
    const { client } = await makeClient(a.id)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(9)
    const names = tools.map((t) => t.name)
    expect(names).toContain('get_my_tasks')
    expect(names).toContain('claim_task')
    expect(names).toContain('acquire_lock')
  })
})

// ── get_my_tasks ──────────────────────────────────────────────────────────────

describe('get_my_tasks', () => {
  it('returns claimable tasks for matching role', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    await mkTask(p.id, 'backend')
    await mkTask(p.id, 'frontend') // should NOT appear

    const { client } = await makeClient(a.id)
    const r = parseResult(await client.callTool({ name: 'get_my_tasks', arguments: {} })) as { claimable: unknown[] }
    expect(r.claimable).toHaveLength(1)
  })

  it('returns mine: tasks already claimed by this agent', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')
    await db.claimTask(t.id, a.id)

    const { client } = await makeClient(a.id)
    const r = parseResult(await client.callTool({ name: 'get_my_tasks', arguments: {} })) as { mine: unknown[] }
    expect(r.mine).toHaveLength(1)
  })
})

// ── claim_task race ───────────────────────────────────────────────────────────

describe('claim_task', () => {
  it('only one of two agents wins the race', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')

    const { client: c1 } = await makeClient(a1.id)
    const { client: c2 } = await makeClient(a2.id)

    const [r1, r2] = (await Promise.all([
      c1.callTool({ name: 'claim_task', arguments: { task_id: t.id } }),
      c2.callTool({ name: 'claim_task', arguments: { task_id: t.id } }),
    ])).map(parseResult) as [{ success: boolean }, { success: boolean; code?: string }]

    const wins = [r1.success, r2.success].filter(Boolean)
    expect(wins).toHaveLength(1)

    const loser = (r1.success ? r2 : r1) as unknown as { code: string }
    expect(loser.code).toBe('TASK_ALREADY_CLAIMED')
  })

  it('claims with path locks succeed', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const t = await mkTask(p.id, 'backend')

    const { client } = await makeClient(a.id)
    const r = parseResult(await client.callTool({
      name: 'claim_task',
      arguments: { task_id: t.id, paths_to_lock: ['src/api/**'] },
    })) as { success: boolean; locks: unknown[] }

    expect(r.success).toBe(true)
    expect(r.locks).toHaveLength(1)
  })
})

// ── acquire_lock collision ────────────────────────────────────────────────────

describe('acquire_lock', () => {
  it('second agent cannot acquire overlapping paths', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'frontend')

    const { client: c1 } = await makeClient(a1.id)
    const { client: c2 } = await makeClient(a2.id)

    const r1 = parseResult(await c1.callTool({ name: 'acquire_lock', arguments: { paths: ['src/api/**'] } })) as { success: boolean }
    const r2 = parseResult(await c2.callTool({ name: 'acquire_lock', arguments: { paths: ['src/api/billing/**'] } })) as { success: boolean; conflicts: unknown[] }

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(false)
    expect(r2.conflicts?.length).toBeGreaterThan(0)
  })

  it('non-overlapping paths both succeed', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'frontend')

    const { client: c1 } = await makeClient(a1.id)
    const { client: c2 } = await makeClient(a2.id)

    const r1 = parseResult(await c1.callTool({ name: 'acquire_lock', arguments: { paths: ['src/api/**'] } })) as { success: boolean }
    const r2 = parseResult(await c2.callTool({ name: 'acquire_lock', arguments: { paths: ['src/frontend/**'] } })) as { success: boolean }

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
  })
})

// ── get_project_status ────────────────────────────────────────────────────────

describe('get_project_status', () => {
  it('returns agent summaries and task counts', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    await mkTask(p.id, 'backend')
    await mkTask(p.id, 'backend')

    const { client } = await makeClient(a.id)
    const r = parseResult(await client.callTool({ name: 'get_project_status', arguments: {} })) as {
      agents: unknown[]
      tasks_by_status: Record<string, number>
    }

    expect(r.agents).toHaveLength(1)
    expect(r.tasks_by_status['backlog']).toBe(2)
  })
})

// ── report_blocker ────────────────────────────────────────────────────────────

describe('report_blocker', () => {
  it('sets task blocked and leaves note to orchestrator', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const orch = await mkAgent(p.id, 'orchestrator')
    const t = await mkTask(p.id, 'backend')
    await db.claimTask(t.id, a.id)

    const { client } = await makeClient(a.id)
    await client.callTool({ name: 'report_blocker', arguments: { task_id: t.id, reason: 'Need DB migration first' } })

    const task = await db.getTask(t.id)
    expect(task?.status).toBe('blocked')

    const notes = await db.getNotesForAgent(orch.id, false)
    expect(notes.some((n) => n.content.includes('Need DB migration first'))).toBe(true)
  })
})

// ── leave_note + get_notes ────────────────────────────────────────────────────

describe('notes round-trip', () => {
  it('leave_note + get_notes marks as read', async () => {
    const p = await mkProject()
    const a1 = await mkAgent(p.id, 'backend')
    const a2 = await mkAgent(p.id, 'frontend')

    const { client: c1 } = await makeClient(a1.id)
    const { client: c2 } = await makeClient(a2.id)

    await c1.callTool({ name: 'leave_note', arguments: { content: 'hello', to_agent_id: a2.id } })

    const r = parseResult(await c2.callTool({ name: 'get_notes', arguments: {} })) as { notes: unknown[] }
    expect(r.notes).toHaveLength(1)

    // Second call should return empty (already read)
    const r2 = parseResult(await c2.callTool({ name: 'get_notes', arguments: {} })) as { notes: unknown[] }
    expect(r2.notes).toHaveLength(0)
  })
})
