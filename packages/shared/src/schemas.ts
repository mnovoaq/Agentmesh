import { z } from 'zod'

// Reusable enum schemas

export const TaskStatusSchema = z.enum([
  'backlog', 'claimed', 'in_progress', 'blocked', 'review', 'done', 'cancelled',
])

export const AgentRoleSchema = z.enum([
  'orchestrator', 'backend', 'frontend', 'qa', 'reviewer', 'release', 'integration', 'scrum-master',
])

export const EffortSizeSchema = z.enum(['XS', 'S', 'M', 'L', 'XL'])

// Only statuses a worker can set on update
export const WorkerTaskStatusSchema = z.enum(['in_progress', 'blocked', 'review', 'done'])

// MCP tool input schemas — worker side

export const GetMyTasksInputSchema = z.object({
  status: z.array(TaskStatusSchema).optional(),
  include_unclaimable: z.boolean().optional().default(false),
})
export type GetMyTasksInput = z.infer<typeof GetMyTasksInputSchema>

export const ClaimTaskInputSchema = z.object({
  task_id: z.string().min(1),
  paths_to_lock: z.array(z.string().min(1)).optional(),
})
export type ClaimTaskInput = z.infer<typeof ClaimTaskInputSchema>

export const UpdateTaskStatusInputSchema = z
  .object({
    task_id: z.string().min(1),
    status: WorkerTaskStatusSchema,
    notes: z.string().optional(),
    pr_url: z.string().url().optional(),
  })
  .refine(
    (d) => d.status !== 'blocked' || (d.notes !== undefined && d.notes.trim().length > 0),
    { message: 'notes is required when status is blocked', path: ['notes'] }
  )
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>

export const ReportBlockerInputSchema = z.object({
  task_id: z.string().min(1),
  reason: z.string().min(1),
  needs_role: AgentRoleSchema.optional(),
})
export type ReportBlockerInput = z.infer<typeof ReportBlockerInputSchema>

export const AcquireLockInputSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  task_id: z.string().min(1).optional(),
  ttl_minutes: z.number().int().positive().max(1440).optional().default(120),
})
export type AcquireLockInput = z.infer<typeof AcquireLockInputSchema>

export const ReleaseLockInputSchema = z.object({
  lock_id: z.string().min(1),
})
export type ReleaseLockInput = z.infer<typeof ReleaseLockInputSchema>

export const LeaveNoteInputSchema = z.object({
  content: z.string().min(1),
  to_agent_id: z.string().min(1).optional(),
  to_role: AgentRoleSchema.optional(),
  task_id: z.string().min(1).optional(),
})
export type LeaveNoteInput = z.infer<typeof LeaveNoteInputSchema>

export const GetNotesInputSchema = z.object({
  include_read: z.boolean().optional().default(false),
})
export type GetNotesInput = z.infer<typeof GetNotesInputSchema>

export const GetProjectStatusInputSchema = z.object({})
export type GetProjectStatusInput = z.infer<typeof GetProjectStatusInputSchema>

// MCP tool input schemas — orchestrator only

export const CreateTaskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  acceptance_criteria: z.string().min(1),
  role_required: AgentRoleSchema,
  priority: z.number().int().min(1).max(5).optional().default(3),
  estimated_effort: EffortSizeSchema.optional(),
  branch_name: z.string().optional(),
  sprint_id: z.string().optional(),
  depends_on: z.array(z.string().min(1)).optional(),
})
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export const UpdateTaskDependenciesInputSchema = z.object({
  task_id: z.string().min(1),
  depends_on: z.array(z.string().min(1)),
})
export type UpdateTaskDependenciesInput = z.infer<typeof UpdateTaskDependenciesInputSchema>

export const ReassignTaskInputSchema = z.object({
  task_id: z.string().min(1),
  to_agent_id: z.string().min(1),
})
export type ReassignTaskInput = z.infer<typeof ReassignTaskInputSchema>

export const CancelTaskInputSchema = z.object({
  task_id: z.string().min(1),
  reason: z.string().min(1),
})
export type CancelTaskInput = z.infer<typeof CancelTaskInputSchema>
