// Minimal ASCII table rendering

export function table(rows: Record<string, unknown>[], columns?: string[]): void {
  if (rows.length === 0) { console.log('(no results)'); return }

  const cols = columns ?? Object.keys(rows[0]!)
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
  )

  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+'
  const header = '| ' + cols.map((c, i) => c.toUpperCase().padEnd(widths[i]!)).join(' | ') + ' |'

  console.log(sep)
  console.log(header)
  console.log(sep)
  for (const row of rows) {
    const line = '| ' + cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i]!)).join(' | ') + ' |'
    console.log(line)
  }
  console.log(sep)
}

export function kv(obj: Record<string, unknown>): void {
  const keyWidth = Math.max(...Object.keys(obj).map((k) => k.length))
  for (const [k, v] of Object.entries(obj)) {
    console.log(`  ${k.padEnd(keyWidth)}  ${v ?? ''}`)
  }
}

export function ts(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}
