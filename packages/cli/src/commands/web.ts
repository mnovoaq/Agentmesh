import type { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function registerWeb(program: Command): void {
  program
    .command('web')
    .description('Start the web dashboard (http://localhost:4000 by default)')
    .option('--project <name_or_id>', 'Project to display')
    .option('--port <n>', 'Port to listen on', '4000')
    .action((opts: { project?: string; port: string }) => {
      const here = dirname(fileURLToPath(import.meta.url))
      // packages/cli/dist/commands → packages/web/dist/index.js
      const webBin = join(here, '..', '..', '..', 'web', 'dist', 'index.js')

      const extraArgs: string[] = []
      if (opts.project) extraArgs.push('--project', opts.project)
      if (opts.port) extraArgs.push('--port', opts.port)

      try {
        execFileSync(process.execPath, [webBin, ...extraArgs], { stdio: 'inherit' })
      } catch {
        // process exited — normal on Ctrl+C
      }
    })
}
