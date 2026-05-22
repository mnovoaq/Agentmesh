import type { Command } from 'commander'
import { execSync } from 'node:child_process'
import { openDb } from '../db.js'

type CIStatus = 'green' | 'red' | 'unknown' | 'no-pr'

function checkCI(prUrl: string): CIStatus {
  // Extract GitHub PR number from URL
  const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/)
  if (!match) return 'unknown'

  try {
    // Exit 0 = all checks passed; non-zero = failures or pending
    execSync(`gh pr checks ${match[2]!} --repo ${match[1]!}`, { stdio: 'pipe' })
    return 'green'
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? ''
    const stdout = (err as { stdout?: Buffer }).stdout?.toString() ?? ''
    // "no checks" means CI is not configured — treat as unknown, not failure
    if (stderr.includes('no checks') || stdout.includes('no checks')) return 'unknown'
    return 'red'
  }
}

function ghAvailable(): boolean {
  try { execSync('gh --version', { stdio: 'pipe' }); return true }
  catch { return false }
}

export function registerMerge(program: Command): void {
  program
    .command('merge <task_id>')
    .description('Merge a completed task branch (verifies done + CI first)')
    .option('--auto', 'Execute the merge directly without spawning a Release agent')
    .option('--into <branch>', 'Target branch to merge into', 'main')
    .action(async (taskId: string, opts: { auto?: boolean; into: string }) => {
      const db = openDb()

      // ── Load task ────────────────────────────────────────────────────────────
      const task = await db.getTask(taskId)
      if (!task) { db.close(); console.error(`Task not found: ${taskId}`); process.exit(1) }

      if (task.status !== 'done') {
        db.close()
        console.error(`Cannot merge: task status is "${task.status}" (must be "done").`)
        process.exit(1)
      }

      const project = await db.getProject(task.project_id)
      if (!project) { db.close(); console.error('Project not found'); process.exit(1) }

      // ── Resolve branch name ──────────────────────────────────────────────────
      let branchName = task.branch_name
      if (!branchName && task.assigned_agent_id) {
        const agent = await db.getAgent(task.assigned_agent_id)
        branchName = agent?.branch_name ?? null
      }

      if (!branchName) {
        db.close()
        console.error('No branch name on task or agent. Assign branch_name to the task before merging.')
        process.exit(1)
      }

      // ── CI check ─────────────────────────────────────────────────────────────
      const prUrl = task.pr_url
      let ciStatus: CIStatus = 'no-pr'

      if (prUrl) {
        if (!ghAvailable()) {
          console.warn('  Warning: gh CLI not found — CI check skipped.')
          ciStatus = 'unknown'
        } else {
          process.stdout.write(`  Checking CI for ${prUrl} ... `)
          ciStatus = checkCI(prUrl)
          console.log(ciStatus)
        }

        if (ciStatus === 'red') {
          db.close()
          console.error(`\nCI is failing. Fix all checks before merging.`)
          console.error(`  PR: ${prUrl}`)
          process.exit(1)
        }
      } else {
        console.warn('  Warning: no PR URL on task — CI check skipped.')
      }

      const repoPath = project.repo_path

      // ── Summary ──────────────────────────────────────────────────────────────
      console.log()
      console.log(`Task    : ${task.title}`)
      console.log(`Branch  : ${branchName}`)
      console.log(`Target  : ${opts.into}`)
      console.log(`PR      : ${prUrl ?? '(none)'}`)
      console.log(`CI      : ${ciStatus}`)
      console.log()

      // ── Auto mode: direct git merge ──────────────────────────────────────────
      if (opts.auto) {
        try {
          // Ensure we're in the right repo and the branch exists
          execSync(`git show-ref --verify --quiet "refs/heads/${branchName}"`, { cwd: repoPath, stdio: 'pipe' })
        } catch {
          try {
            execSync(`git fetch origin "${branchName}"`, { cwd: repoPath, stdio: 'pipe' })
          } catch {
            db.close()
            console.error(`Branch "${branchName}" not found locally or on origin.`)
            process.exit(1)
          }
        }

        try {
          execSync(`git checkout "${opts.into}"`, { cwd: repoPath, stdio: 'pipe' })
          execSync(
            `git merge --no-ff "${branchName}" -m "Merge ${branchName}: ${task.title}"`,
            { cwd: repoPath, stdio: 'pipe' }
          )
        } catch (err) {
          db.close()
          const msg = (err as { stderr?: Buffer }).stderr?.toString().trim() ?? String(err)
          console.error(`Merge failed:\n  ${msg}`)
          process.exit(1)
        }

        db.close()
        console.log(`Merged: ${branchName} → ${opts.into}`)
        console.log()
        console.log('Next steps:')
        console.log(`  agentmesh stop ${task.assigned_agent_id ?? '<agent_id>'}  # release locks + worktree`)
        return
      }

      // ── Delegate mode: instructions for Release agent ────────────────────────
      db.close()
      console.log('Preconditions met. To complete the merge:')
      console.log()
      console.log('Option A — merge directly:')
      console.log()
      console.log(`  agentmesh merge ${taskId} --auto --into ${opts.into}`)
      console.log()
      console.log('Option B — spawn a Release agent:')
      console.log()
      console.log(`  agentmesh spawn release --project "${project.name}" --from ${opts.into}`)
      console.log()
      console.log('  Then open Claude Code in that worktree and tell it:')
      console.log(`  "Merge branch ${branchName} into ${opts.into} for task ${taskId}"`)
    })
}
