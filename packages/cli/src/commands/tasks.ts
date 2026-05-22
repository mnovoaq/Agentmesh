import type { AgentRole, TaskStatus } from '@agentmesh/shared'
import type { Command } from 'commander'
import { openDb } from '../db.js'
import { kv, table, ts } from '../render.js'

function resolveProject(projects: { id: string; name: string }[], nameOrId: string): string {
  const p = projects.find((x) => x.id === nameOrId || x.name === nameOrId)
  if (!p) { console.error(`Project not found: ${nameOrId}`); process.exit(1) }
  return p.id
}

export function registerTasks(program: Command): void {
  program
    .command('tasks')
    .description('List tasks')
    .option('--project <name_or_id>', 'Filter by project')
    .option('--status <status>', 'Filter by status (comma-separated)')
    .option('--role <role>', 'Filter by required role')
    .option('--agent <id>', 'Filter by assigned agent')
    .action(async (opts: { project?: string; status?: string; role?: string; agent?: string }) => {
      const db = openDb()

      let projectId: string | undefined
      if (opts.project) {
        const projects = await db.listProjects()
        projectId = resolveProject(projects, opts.project)
      }

      const statuses = opts.status?.split(',').map((s) => s.trim() as TaskStatus)

      const tasks = await db.listTasks({
        project_id: projectId,
        status: statuses,
        role_required: opts.role as AgentRole | undefined,
        assigned_agent_id: opts.agent,
      })
      db.close()

      table(
        tasks.map((t) => ({
          id: t.id.slice(0, 10),
          title: t.title.slice(0, 40),
          role: t.role_required,
          status: t.status,
          priority: t.priority,
          assigned: t.assigned_agent_id?.slice(0, 8) ?? '',
        }))
      )
    })

  const task = program.command('task').description('Task operations')

  task
    .command('show <task_id>')
    .description('Show task details')
    .action(async (taskId: string) => {
      const db = openDb()
      const t = await db.getTask(taskId)
      db.close()
      if (!t) { console.error(`Task not found: ${taskId}`); process.exit(1) }

      kv({
        id: t.id,
        title: t.title,
        status: t.status,
        role_required: t.role_required,
        priority: t.priority,
        assigned_agent_id: t.assigned_agent_id ?? '',
        branch_name: t.branch_name ?? '',
        pr_url: t.pr_url ?? '',
        created_at: ts(t.created_at),
        updated_at: ts(t.updated_at),
      })
      console.log()
      console.log('Description:')
      console.log(t.description)
      console.log()
      console.log('Acceptance criteria:')
      console.log(t.acceptance_criteria)
    })

  task
    .command('create')
    .description('Create a task (orchestrator-less manual entry)')
    .requiredOption('--project <name_or_id>', 'Project name or id')
    .requiredOption('--title <text>', 'Task title')
    .requiredOption('--role <role>', 'Required role (backend|frontend|qa|reviewer|orchestrator|fullstack|devops)')
    .option('--description <text>', 'Task description', '')
    .option('--criteria <text>', 'Acceptance criteria', '')
    .option('--priority <n>', 'Priority 1-5 (1=highest)', '3')
    .option('--effort <size>', 'Estimated effort (XS|S|M|L|XL)')
    .option('--depends-on <ids>', 'Comma-separated task IDs this task depends on')
    .action(async (opts: {
      project: string
      title: string
      role: string
      description: string
      criteria: string
      priority: string
      effort?: string
      dependsOn?: string
    }) => {
      const db = openDb()
      const projects = await db.listProjects()
      const projectId = resolveProject(projects, opts.project)
      const dependsOn = opts.dependsOn ? opts.dependsOn.split(',').map((s) => s.trim()) : undefined

      const t = await db.createTask({
        project_id: projectId,
        title: opts.title,
        description: opts.description,
        acceptance_criteria: opts.criteria,
        role_required: opts.role as AgentRole,
        priority: parseInt(opts.priority, 10),
        estimated_effort: opts.effort,
        depends_on: dependsOn,
      })
      db.close()

      console.log(`Task created: ${t.id}`)
      kv({
        id: t.id,
        title: t.title,
        role: t.role_required,
        status: t.status,
        priority: t.priority,
      })
    })
}
