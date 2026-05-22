import { describe, expect, it } from 'vitest'
import { AGENTMESH_VERSION } from './index.js'

describe('shared', () => {
  it('exports version', () => {
    expect(AGENTMESH_VERSION).toBe('0.1.0')
  })
})
