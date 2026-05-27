import type { Command } from 'commander'
import { openDb } from '../db.js'
import { kv, table, ts } from '../render.js'

export function registerProject(program: Command): void {
  const proj = program.command('project').description('Manage projects')

  proj
    .command('create <name>')
    .description('Create a new project')
    .option('--repo <path>', 'Repository path', process.cwd())
    .option('--description <text>', 'Project description')
    .action(async (name: string, opts: { repo: string; description?: string }) => {
      const db = openDb()
      const project = await db.createProject({ name, repo_path: opts.repo, description: opts.description })
      db.close()
      console.log(`Project created: ${project.id}`)
      kv({
        id: project.id,
        name: project.name,
        repo_path: project.repo_path,
        description: project.description ?? '',
        status: project.status,
        created_at: ts(project.created_at),
      })
    })

  proj
    .command('list')
    .description('List all projects')
    .action(async () => {
      const db = openDb()
      const projects = await db.listProjects()
      db.close()
      table(
        projects.map((p) => ({
          id: p.id.slice(0, 10),
          name: p.name,
          status: p.status,
          repo_path: p.repo_path,
          created: ts(p.created_at),
        }))
      )
    })

  proj
    .command('reset <name_or_id>')
    .description('Delete all agents, tasks, notes, events and locks for a project (keeps the project itself)')
    .action(async (nameOrId: string) => {
      const db = openDb()
      const projects = await db.listProjects()
      const project = projects.find((p) => p.id === nameOrId || p.name === nameOrId)
      if (!project) { db.close(); console.error(`Project not found: ${nameOrId}`); process.exit(1) }
      const result = await db.resetProject(project.id)
      db.close()
      console.log(`Project reset: ${project.name}`)
      console.log(`  agents removed : ${result.agents}`)
      console.log(`  tasks removed  : ${result.tasks}`)
      console.log(`  notes removed  : ${result.notes}`)
      console.log(`  events removed : ${result.events}`)
      console.log(`  locks removed  : ${result.locks}`)
    })

  proj
    .command('show <name_or_id>')
    .description('Show project details')
    .action(async (nameOrId: string) => {
      const db = openDb()
      const projects = await db.listProjects()
      const project = projects.find((p) => p.id === nameOrId || p.name === nameOrId)
      if (!project) {
        db.close()
        console.error(`Project not found: ${nameOrId}`)
        process.exit(1)
      }

      const agents = await db.listAgents(project.id)
      const tasks = await db.listTasks({ project_id: project.id })
      db.close()

      kv({
        id: project.id,
        name: project.name,
        repo_path: project.repo_path,
        description: project.description ?? '',
        status: project.status,
        created_at: ts(project.created_at),
      })
      console.log()
      console.log(`Agents (${agents.length}):`)
      if (agents.length > 0) {
        table(agents.map((a) => ({ id: a.id.slice(0, 10), role: a.role, status: a.status })))
      } else {
        console.log('  (none)')
      }
      console.log()
      const counts: Record<string, number> = {}
      for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1
      console.log(`Tasks: ${tasks.length} total`)
      for (const [s, n] of Object.entries(counts)) console.log(`  ${s}: ${n}`)
    })
}
