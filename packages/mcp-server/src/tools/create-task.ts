import { CreateTaskInputSchema } from '@agentmesh/shared'
import type { ToolDef } from './types.js'

export const createTaskTool: ToolDef = {
  name: 'create_task',
  description: '[Orchestrator only] Create a task in the backlog with acceptance criteria, role assignment and optional dependencies.',
  inputSchema: {
    type: 'object',
    required: ['title', 'description', 'acceptance_criteria', 'role_required'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      acceptance_criteria: { type: 'string' },
      role_required: { type: 'string', enum: ['orchestrator', 'backend', 'frontend', 'qa', 'reviewer', 'release', 'integration'] },
      priority: { type: 'number', minimum: 1, maximum: 5 },
      estimated_effort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
      branch_name: { type: 'string' },
      sprint_id: { type: 'string' },
      depends_on: { type: 'array', items: { type: 'string' } },
    },
  },
  async execute(rawInput, ctx, db) {
    const input = CreateTaskInputSchema.parse(rawInput)
    const task = await db.createTask({
      project_id: ctx.projectId,
      title: input.title,
      description: input.description,
      acceptance_criteria: input.acceptance_criteria,
      role_required: input.role_required,
      priority: input.priority,
      estimated_effort: input.estimated_effort,
      branch_name: input.branch_name,
      sprint_id: input.sprint_id,
      depends_on: input.depends_on,
    })
    return { task }
  },
}
