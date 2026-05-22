import micromatch from 'micromatch'

// Extract the literal path prefix before any wildcard characters.
function literalBase(glob: string): string {
  const parts = glob.split('/')
  const result: string[] = []
  for (const part of parts) {
    if (/[*?{[]/.test(part)) break
    result.push(part)
  }
  return result.join('/')
}

// Conservative check: two globs conflict if their path spaces can overlap.
// In doubt, returns true (spec: "matcheo conservador").
export function globsConflict(a: string, b: string): boolean {
  if (a === b) return true

  const baseA = literalBase(a)
  const baseB = literalBase(b)

  // One base is a directory ancestor of the other → overlap
  if (baseA === baseB) return true
  if (baseA.startsWith(baseB + '/') || baseB.startsWith(baseA + '/')) return true

  // Sample paths: check if a representative path from one glob matches the other
  const sampleA = baseA ? `${baseA}/index.ts` : 'index.ts'
  const sampleB = baseB ? `${baseB}/index.ts` : 'index.ts'

  if (micromatch.isMatch(sampleA, b)) return true
  if (micromatch.isMatch(sampleB, a)) return true

  return false
}
