import type { AgentRole } from '@agentmesh/shared'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentMeshServer } from '../server.js'
import { SQLiteAdapter } from '../storage/sqlite.js'

let db: SQLiteAdapter

beforeEach(() => { db = new SQLiteAdapter(':memory:') })
afterEach(() => { db.close() })

async function mkProject() {
  return db.createProject({ name: 'proj', repo_path: '/tmp' })
}

async function mkAgent(projectId: string, role: AgentRole) {
  return db.registerAgent({ role, project_id: projectId })
}

async function makeClient(agentId: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair()
  const server = createAgentMeshServer(db, agentId)
  await server.connect(st)
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} })
  await client.connect(ct)
  return client
}

function parse(result: unknown): unknown {
  const r = result as { content: { text: string }[] }
  return JSON.parse(r.content[0]!.text)
}

const validTask = {
  title: 'Auth module',
  description: 'Implement JWT auth',
  acceptance_criteria: 'Tests pass, login works',
  role_required: 'backend',
}

// ── Authorization gate ────────────────────────────────────────────────────────

describe('role gate', () => {
  it('backend agent calling create_task gets FORBIDDEN', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'backend')
    const client = await makeClient(a.id)

    const r = parse(await client.callTool({ name: 'create_task', arguments: validTask })) as { code: string }
    expect(r.code).toBe('FORBIDDEN')
  })

  it('frontend agent calling reassign_task gets FORBIDDEN', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'frontend')
    const client = await makeClient(a.id)

    const r = parse(await client.callTool({ name: 'reassign_task', arguments: { task_id: 'x', to_agent_id: 'y' } })) as { code: string }
    expect(r.code).toBe('FORBIDDEN')
  })

  it('qa agent calling cancel_task gets FORBIDDEN', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'qa')
    const client = await makeClient(a.id)

    const r = parse(await client.callTool({ name: 'cancel_task', arguments: { task_id: 'x', reason: 'no' } })) as { code: string }
    expect(r.code).toBe('FORBIDDEN')
  })

  it('qa agent calling update_task_dependencies gets FORBIDDEN', async () => {
    const p = await mkProject()
    const a = await mkAgent(p.id, 'qa')
    const client = await makeClient(a.id)

    const r = parse(await client.callTool({ name: 'update_task_dependencies', arguments: { task_id: 'x', depends_on: [] } })) as { code: string }
    expect(r.code).toBe('FORBIDDEN')
  })
})

// ── Orchestrator tool functionality ───────────────────────────────────────────

describe('orchestrator tools', () => {
  it('orchestrator can create a task', async () => {
    const p = await mkProject()
    const orch = await mkAgent(p.id, 'orchestrator')
    const client = await makeClient(orch.id)

    const r = parse(await client.callTool({ name: 'create_task', arguments: validTask })) as { task: { status: string; title: string } }
    expect(r.task.status).toBe('backlog')
    expect(r.task.title).toBe('Auth module')
  })

  it('orchestrator can create a task with dependencies', async () => {
    const p = await mkProject()
    const orch = await mkAgent(p.id, 'orchestrator')
    const client = await makeClient(orch.id)

    const r1 = parse(await client.callTool({ name: 'create_task', arguments: { ...validTask, title: 'Task A' } })) as { task: { id: string } }
    const r2 = parse(await client.callTool({ name: 'create_task', arguments: { ...validTask, title: 'Task B', depends_on: [r1.task.id] } })) as { task: { id: string } }

    // Task B should have unmet dep (Task A is not done)
    const unmet = await db.listUnmetDependencies(r2.task.id)
    expect(unmet).toHaveLength(1)
    expect(unmet[0]).toBe(r1.task.id)
  })

  it('orchestrator can update task dependencies', async () => {
    const p = await mkProject()
    const orch = await mkAgent(p.id, 'orchestrator')
    const client = await makeClient(orch.id)

    const { task: t1 } = parse(await client.callTool({ name: 'create_task', arguments: { ...validTask, title: 'T1' } })) as { task: { id: string } }
    const { task: t2 } = parse(await client.callTool({ name: 'create_task', arguments: { ...validTask, title: 'T2' } })) as { task: { id: string } }

    await client.callTool({ name: 'update_task_dependencies', arguments: { task_id: t2.id, depends_on: [t1.id] } })
    const unmet = await db.listUnmetDependencies(t2.id)
    expect(unmet).toHaveLength(1)

    // Clear deps
    await client.callTool({ name: 'update_task_dependencies', arguments: { task_id: t2.id, depends_on: [] } })
    expect(await db.listUnmetDependencies(t2.id)).toHaveLength(0)
  })

  it('orchestrator can reassign a task', async () => {
    const p = await mkProject()
    const orch = await mkAgent(p.id, 'orchestrator')
    const worker1 = await mkAgent(p.id, 'backend')
    const worker2 = await mkAgent(p.id, 'backend')
    const client = await makeClient(orch.id)

    const { task } = parse(await client.callTool({ name: 'create_task', arguments: validTask })) as { task: { id: string } }
    await db.claimTask(task.id, worker1.id)

    const r = parse(await client.callTool({ name: 'reassign_task', arguments: { task_id: task.id, to_agent_id: worker2.id } })) as { task: { assigned_agent_id: string } }
    expect(r.task.assigned_agent_id).toBe(worker2.id)
  })

  it('orchestrator can cancel a task', async () => {
    const p = await mkProject()
    const orch = await mkAgent(p.id, 'orchestrator')
    const client = await makeClient(orch.id)

    const { task } = parse(await client.callTool({ name: 'create_task', arguments: validTask })) as { task: { id: string } }
    const r = parse(await client.callTool({ name: 'cancel_task', arguments: { task_id: task.id, reason: 'scope changed' } })) as { task: { status: string } }
    expect(r.task.status).toBe('cancelled')
  })

  it('server lists all 13 tools (9 worker + 4 orchestrator)', async () => {
    const p = await mkProject()
    const orch = await mkAgent(p.id, 'orchestrator')
    const client = await makeClient(orch.id)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(13)
  })
})
