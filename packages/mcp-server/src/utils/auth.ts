import type { Agent, StorageAdapter } from '@agentmesh/shared'

export async function resolveAgent(db: StorageAdapter, agentId: string): Promise<Agent | null> {
  return db.getAgent(agentId)
}
