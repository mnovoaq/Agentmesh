// ASCII table + formatting helpers

export function tableStr(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '  (none)\n'

  const cols = columns ?? Object.keys(rows[0]!)
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
  )

  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+'
  const header = '| ' + cols.map((c, i) => c.toUpperCase().padEnd(widths[i]!)).join(' | ') + ' |'
  const dataLines = rows.map(
    (row) => '| ' + cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i]!)).join(' | ') + ' |'
  )

  return [sep, header, sep, ...dataLines, sep].join('\n') + '\n'
}

export function table(rows: Record<string, unknown>[], columns?: string[]): void {
  process.stdout.write(tableStr(rows, columns))
}

export function kv(obj: Record<string, unknown>): void {
  const keyWidth = Math.max(...Object.keys(obj).map((k) => k.length))
  for (const [k, v] of Object.entries(obj)) {
    console.log(`  ${k.padEnd(keyWidth)}  ${v ?? ''}`)
  }
}

export function section(title: string): string {
  return `\n${title}\n${'─'.repeat(title.length)}\n`
}

export function ts(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export function relativeTime(ms: number): string {
  const diffMs = ms - Date.now()
  const abs = Math.abs(diffMs)
  const past = diffMs < 0

  if (abs < 60_000) return past ? 'just now' : 'in <1m'
  if (abs < 3_600_000) {
    const m = Math.round(abs / 60_000)
    return past ? `${m}m ago` : `in ${m}m`
  }
  const h = Math.round(abs / 3_600_000)
  return past ? `${h}h ago` : `in ${h}h`
}
