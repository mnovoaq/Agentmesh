import pino from 'pino'

// MCP stdio uses stdout for the protocol — logger MUST write to stderr
export const logger = pino({ name: 'agentmesh-mcp', level: process.env['LOG_LEVEL'] ?? 'info' }, process.stderr)
