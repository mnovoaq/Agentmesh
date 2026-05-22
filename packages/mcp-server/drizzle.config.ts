import type { Config } from 'drizzle-kit'

export default {
  schema: './src/storage/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
} satisfies Config
