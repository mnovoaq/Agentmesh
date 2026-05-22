import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  repo_path: text('repo_path').notNull(),
  status: text('status').notNull().default('active'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const sprints = sqliteTable('sprints', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  created_at: integer('created_at').notNull(),
})

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    role: text('role').notNull(),
    project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    worktree_path: text('worktree_path'),
    branch_name: text('branch_name'),
    status: text('status').notNull().default('idle'),
    last_heartbeat: integer('last_heartbeat').notNull(),
    spawned_at: integer('spawned_at').notNull(),
  },
  (t) => ({ projectStatusIdx: index('idx_agents_project_status').on(t.project_id, t.status) }),
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    sprint_id: text('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    acceptance_criteria: text('acceptance_criteria').notNull(),
    role_required: text('role_required').notNull(),
    status: text('status').notNull().default('backlog'),
    assigned_agent_id: text('assigned_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    priority: integer('priority').notNull().default(3),
    estimated_effort: text('estimated_effort'),
    branch_name: text('branch_name'),
    pr_url: text('pr_url'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
    completed_at: integer('completed_at'),
  },
  (t) => ({
    projectStatusIdx: index('idx_tasks_project_status').on(t.project_id, t.status),
    assignedIdx: index('idx_tasks_assigned').on(t.assigned_agent_id),
  }),
)

export const taskDependencies = sqliteTable(
  'task_dependencies',
  {
    task_id: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    depends_on_task_id: text('depends_on_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.task_id, t.depends_on_task_id] }) }),
)

export const locks = sqliteTable(
  'locks',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    path_glob: text('path_glob').notNull(),
    agent_id: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    task_id: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    acquired_at: integer('acquired_at').notNull(),
    expires_at: integer('expires_at').notNull(),
  },
  (t) => ({ projectIdx: index('idx_locks_project').on(t.project_id) }),
)

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    from_agent_id: text('from_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    to_agent_id: text('to_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    to_role: text('to_role'),
    task_id: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    read: integer('read').notNull().default(0),
    created_at: integer('created_at').notNull(),
  },
  (t) => ({ toAgentUnreadIdx: index('idx_notes_to_agent_unread').on(t.to_agent_id, t.read) }),
)

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  project_id: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  agent_id: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  event_type: text('event_type').notNull(),
  payload: text('payload').notNull(),
  created_at: integer('created_at').notNull(),
})
