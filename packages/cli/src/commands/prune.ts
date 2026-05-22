import type { Command } from 'commander'
import { openDb } from '../db.js'

export function registerPrune(program: Command): void {
  program
    .command('prune')
    .description('Remove stale agents (offline >24h), expired locks, and old events (>30d)')
    .option('--agent-ttl <hours>', 'Hours before offline agents are pruned', '24')
    .option('--event-ttl <days>', 'Days before events are pruned', '30')
    .action(async (opts: { agentTtl: string; eventTtl: string }) => {
      const db = openDb()

      const agentOfflineMs = parseInt(opts.agentTtl, 10) * 60 * 60 * 1000
      const eventsOlderMs = parseInt(opts.eventTtl, 10) * 24 * 60 * 60 * 1000

      const { agents, locks, events } = await db.pruneStaleData({ agentOfflineMs, eventsOlderMs })
      db.close()

      console.log('Pruned:')
      console.log(`  agents (offline >${opts.agentTtl}h) : ${agents}`)
      console.log(`  locks  (expired)              : ${locks}`)
      console.log(`  events (>${opts.eventTtl}d old)         : ${events}`)
    })
}
