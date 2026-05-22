import type { Command } from 'commander'
import { openDb } from '../db.js'
import { table, ts } from '../render.js'

export function registerNotes(program: Command): void {
  program
    .command('notes')
    .description('List notes')
    .option('--project <name_or_id>', 'Filter by project')
    .option('--unread', 'Show only unread notes')
    .option('--agent <id>', 'Filter notes for a specific agent')
    .action(async (opts: { project?: string; unread?: boolean; agent?: string }) => {
      const db = openDb()

      let projectId: string | undefined
      if (opts.project) {
        const projects = await db.listProjects()
        const p = projects.find((x) => x.id === opts.project || x.name === opts.project)
        if (!p) { db.close(); console.error(`Project not found: ${opts.project}`); process.exit(1) }
        projectId = p.id
      }

      if (!projectId) {
        // Default to first project if only one exists
        const projects = await db.listProjects()
        if (projects.length === 1) {
          projectId = projects[0]!.id
        } else if (projects.length === 0) {
          db.close()
          console.log('No projects found.')
          return
        } else {
          db.close()
          console.error('Multiple projects found. Specify --project <name_or_id>')
          process.exit(1)
        }
      }

      const notes = await db.listNotes(projectId, { unread: opts.unread, agentId: opts.agent })
      db.close()

      table(
        notes.map((n) => ({
          id: n.id.slice(0, 10),
          from: n.from_agent_id?.slice(0, 8) ?? 'system',
          to: n.to_agent_id?.slice(0, 8) ?? n.to_role ?? 'broadcast',
          read: n.read ? 'yes' : 'no',
          created: ts(n.created_at),
          content: n.content.slice(0, 60),
        }))
      )
    })
}
