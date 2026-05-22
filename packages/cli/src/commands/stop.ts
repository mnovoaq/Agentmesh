import type { Command } from 'commander'
import { execSync } from 'node:child_process'
import { openDb } from '../db.js'

export function registerStop(program: Command): void {
  program
    .command('stop <agent_id>')
    .description('Mark an agent offline, release its locks and unassign its tasks')
    .option('--remove-worktree', 'Also remove the git worktree from disk')
    .action(async (agentId: string, opts: { removeWorktree?: boolean }) => {
      const db = openDb()

      const agent = await db.getAgent(agentId)
      if (!agent) { db.close(); console.error(`Agent not found: ${agentId}`); process.exit(1) }

      await db.stopAgent(agentId)
      db.close()

      console.log(`Agent stopped: ${agentId}`)
      console.log(`  role     : ${agent.role}`)
      console.log(`  worktree : ${agent.worktree_path ?? '(none)'}`)

      if (opts.removeWorktree && agent.worktree_path) {
        try {
          // Get the repo path from projects (worktree can tell us the parent repo)
          // Use git worktree remove to cleanly remove it
          execSync(`git worktree remove --force "${agent.worktree_path}"`, { stdio: 'pipe' })
          console.log(`  worktree removed from disk`)
        } catch (err) {
          const msg = (err as { stderr?: Buffer }).stderr?.toString().trim() ?? String(err)
          console.warn(`  Warning: could not remove worktree: ${msg}`)
        }
      }
    })
}
