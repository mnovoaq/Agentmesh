import { describe, expect, it } from 'vitest'
import {
  AcquireLockInputSchema,
  CancelTaskInputSchema,
  ClaimTaskInputSchema,
  CreateTaskInputSchema,
  GetMyTasksInputSchema,
  GetNotesInputSchema,
  LeaveNoteInputSchema,
  ReassignTaskInputSchema,
  ReleaseLockInputSchema,
  ReportBlockerInputSchema,
  UpdateTaskDependenciesInputSchema,
  UpdateTaskStatusInputSchema,
} from './schemas.js'

// helpers
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, val: unknown) =>
  expect(schema.safeParse(val).success).toBe(true)
const fail = (schema: { safeParse: (v: unknown) => { success: boolean } }, val: unknown) =>
  expect(schema.safeParse(val).success).toBe(false)

describe('GetMyTasksInputSchema', () => {
  it('accepts empty input with defaults', () => {
    const r = GetMyTasksInputSchema.parse({})
    expect(r.include_unclaimable).toBe(false)
  })
  it('accepts valid status array', () => ok(GetMyTasksInputSchema, { status: ['backlog', 'claimed'] }))
  it('accepts include_unclaimable=true', () => ok(GetMyTasksInputSchema, { include_unclaimable: true }))
  it('rejects invalid status value', () => fail(GetMyTasksInputSchema, { status: ['unknown'] }))
  it('rejects non-boolean include_unclaimable', () => fail(GetMyTasksInputSchema, { include_unclaimable: 'yes' }))
})

describe('ClaimTaskInputSchema', () => {
  it('accepts task_id only', () => ok(ClaimTaskInputSchema, { task_id: 'task_1' }))
  it('accepts task_id with paths', () => ok(ClaimTaskInputSchema, { task_id: 'task_1', paths_to_lock: ['src/**'] }))
  it('rejects empty task_id', () => fail(ClaimTaskInputSchema, { task_id: '' }))
  it('rejects missing task_id', () => fail(ClaimTaskInputSchema, {}))
  it('rejects empty string in paths_to_lock', () => fail(ClaimTaskInputSchema, { task_id: 'task_1', paths_to_lock: [''] }))
})

describe('UpdateTaskStatusInputSchema', () => {
  it('accepts in_progress status', () => ok(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'in_progress' }))
  it('accepts review with pr_url', () => ok(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'review', pr_url: 'https://github.com/org/repo/pull/1' }))
  it('accepts done status', () => ok(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'done' }))
  it('accepts blocked with notes', () => ok(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'blocked', notes: 'waiting on dep' }))
  it('rejects blocked without notes', () => fail(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'blocked' }))
  it('rejects blocked with empty notes', () => fail(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'blocked', notes: '   ' }))
  it('rejects invalid status', () => fail(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'backlog' }))
  it('rejects invalid pr_url', () => fail(UpdateTaskStatusInputSchema, { task_id: 't1', status: 'review', pr_url: 'not-a-url' }))
  it('rejects missing task_id', () => fail(UpdateTaskStatusInputSchema, { status: 'done' }))
})

describe('ReportBlockerInputSchema', () => {
  it('accepts required fields', () => ok(ReportBlockerInputSchema, { task_id: 't1', reason: 'blocked by auth' }))
  it('accepts with needs_role', () => ok(ReportBlockerInputSchema, { task_id: 't1', reason: 'need db migration', needs_role: 'backend' }))
  it('rejects empty reason', () => fail(ReportBlockerInputSchema, { task_id: 't1', reason: '' }))
  it('rejects invalid needs_role', () => fail(ReportBlockerInputSchema, { task_id: 't1', reason: 'x', needs_role: 'devops' }))
  it('rejects missing task_id', () => fail(ReportBlockerInputSchema, { reason: 'x' }))
})

describe('AcquireLockInputSchema', () => {
  it('accepts paths only', () => ok(AcquireLockInputSchema, { paths: ['src/api/**'] }))
  it('accepts with optional fields', () => ok(AcquireLockInputSchema, { paths: ['src/api/**'], task_id: 't1', ttl_minutes: 60 }))
  it('defaults ttl_minutes to 120', () => {
    const r = AcquireLockInputSchema.parse({ paths: ['src/**'] })
    expect(r.ttl_minutes).toBe(120)
  })
  it('rejects empty paths array', () => fail(AcquireLockInputSchema, { paths: [] }))
  it('rejects empty string path', () => fail(AcquireLockInputSchema, { paths: [''] }))
  it('rejects ttl_minutes=0', () => fail(AcquireLockInputSchema, { paths: ['src/**'], ttl_minutes: 0 }))
  it('rejects ttl_minutes>1440', () => fail(AcquireLockInputSchema, { paths: ['src/**'], ttl_minutes: 1441 }))
  it('rejects non-integer ttl_minutes', () => fail(AcquireLockInputSchema, { paths: ['src/**'], ttl_minutes: 1.5 }))
})

describe('ReleaseLockInputSchema', () => {
  it('accepts valid lock_id', () => ok(ReleaseLockInputSchema, { lock_id: 'lock_1' }))
  it('rejects empty lock_id', () => fail(ReleaseLockInputSchema, { lock_id: '' }))
  it('rejects missing lock_id', () => fail(ReleaseLockInputSchema, {}))
})

describe('LeaveNoteInputSchema', () => {
  it('accepts broadcast note (no target)', () => ok(LeaveNoteInputSchema, { content: 'hello all' }))
  it('accepts note to specific agent', () => ok(LeaveNoteInputSchema, { content: 'hi', to_agent_id: 'ag_1' }))
  it('accepts note to role', () => ok(LeaveNoteInputSchema, { content: 'hi', to_role: 'orchestrator' }))
  it('accepts note with task_id', () => ok(LeaveNoteInputSchema, { content: 'done', task_id: 't1' }))
  it('rejects empty content', () => fail(LeaveNoteInputSchema, { content: '' }))
  it('rejects invalid role', () => fail(LeaveNoteInputSchema, { content: 'x', to_role: 'manager' }))
  it('rejects missing content', () => fail(LeaveNoteInputSchema, {}))
})

describe('GetNotesInputSchema', () => {
  it('defaults include_read to false', () => {
    expect(GetNotesInputSchema.parse({}).include_read).toBe(false)
  })
  it('accepts include_read=true', () => ok(GetNotesInputSchema, { include_read: true }))
  it('rejects non-boolean', () => fail(GetNotesInputSchema, { include_read: 1 }))
})

describe('CreateTaskInputSchema (orchestrator)', () => {
  const base = {
    title: 'Implement auth',
    description: 'JWT-based auth',
    acceptance_criteria: 'Tests pass, auth works',
    role_required: 'backend',
  }
  it('accepts minimal valid input', () => ok(CreateTaskInputSchema, base))
  it('defaults priority to 3', () => {
    expect(CreateTaskInputSchema.parse(base).priority).toBe(3)
  })
  it('accepts all optional fields', () => ok(CreateTaskInputSchema, {
    ...base,
    priority: 1,
    estimated_effort: 'M',
    branch_name: 'feat/auth',
    sprint_id: 'sprint_1',
    depends_on: ['task_0'],
  }))
  it('rejects priority out of range', () => fail(CreateTaskInputSchema, { ...base, priority: 6 }))
  it('rejects priority=0', () => fail(CreateTaskInputSchema, { ...base, priority: 0 }))
  it('rejects invalid effort size', () => fail(CreateTaskInputSchema, { ...base, estimated_effort: 'XXL' }))
  it('rejects invalid role_required', () => fail(CreateTaskInputSchema, { ...base, role_required: 'cto' }))
  it('rejects empty title', () => fail(CreateTaskInputSchema, { ...base, title: '' }))
  it('rejects empty description', () => fail(CreateTaskInputSchema, { ...base, description: '' }))
  it('rejects empty acceptance_criteria', () => fail(CreateTaskInputSchema, { ...base, acceptance_criteria: '' }))
})

describe('UpdateTaskDependenciesInputSchema', () => {
  it('accepts valid input', () => ok(UpdateTaskDependenciesInputSchema, { task_id: 't1', depends_on: ['t2', 't3'] }))
  it('accepts empty depends_on array', () => ok(UpdateTaskDependenciesInputSchema, { task_id: 't1', depends_on: [] }))
  it('rejects empty string in depends_on', () => fail(UpdateTaskDependenciesInputSchema, { task_id: 't1', depends_on: [''] }))
  it('rejects missing task_id', () => fail(UpdateTaskDependenciesInputSchema, { depends_on: [] }))
})

describe('ReassignTaskInputSchema', () => {
  it('accepts valid input', () => ok(ReassignTaskInputSchema, { task_id: 't1', to_agent_id: 'ag_2' }))
  it('rejects empty task_id', () => fail(ReassignTaskInputSchema, { task_id: '', to_agent_id: 'ag_2' }))
  it('rejects empty to_agent_id', () => fail(ReassignTaskInputSchema, { task_id: 't1', to_agent_id: '' }))
  it('rejects missing fields', () => fail(ReassignTaskInputSchema, {}))
})

describe('CancelTaskInputSchema', () => {
  it('accepts valid input', () => ok(CancelTaskInputSchema, { task_id: 't1', reason: 'no longer needed' }))
  it('rejects empty reason', () => fail(CancelTaskInputSchema, { task_id: 't1', reason: '' }))
  it('rejects missing reason', () => fail(CancelTaskInputSchema, { task_id: 't1' }))
})
