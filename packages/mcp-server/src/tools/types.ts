import type { AgentRole, StorageAdapter } from '@agentmesh/shared'

export interface AgentContext {
  agentId: string
  projectId: string
  role: AgentRole
}

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(rawInput: unknown, ctx: AgentContext, db: StorageAdapter): Promise<unknown>
}
