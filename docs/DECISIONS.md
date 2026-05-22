# Architecture Decision Records

## ADR-001: Raw better-sqlite3 en lugar de Drizzle query builder

**Contexto:** La Fase 2 requiere implementar SQLiteAdapter con Drizzle ORM.

**Decisión:** Se usa Drizzle solo para definición de schema (type inference + drizzle-kit para migraciones). Las queries y transacciones usan `better-sqlite3` directamente con prepared statements.

**Alternativa descartada:** Usar el query builder de Drizzle para todas las operaciones.

**Razón:** Para operaciones críticas como `claimTask` y `acquireLock`, el control explícito sobre la transacción SQLite es esencial. `db.transaction()` de `better-sqlite3` garantiza atomicidad de forma directa y predecible. El query builder de Drizzle agrega una capa de abstracción que puede oscurecer errores de concurrencia.

---

## ADR-002: Detección conservadora de conflictos de lock (prefix + micromatch sample)

**Contexto:** El spec pide usar `micromatch` con matcheo conservador para detectar si dos globs colisionan.

**Decisión:** Se implementa una función `globsConflict(a, b)` que:
1. Compara los prefijos literales de los globs (segmentos antes del primer wildcard)
2. Usa `micromatch.isMatch` con un path de muestra (`baseDir/index.ts`) para cross-check

**Razón:** Determinar si dos globs arbitrarios comparten al menos un path es computacionalmente complejo. El enfoque conservador (en duda, conflicto) favorece la seguridad sobre el paralelismo innecesario. El spec lo explicita: "en duda, considerar conflicto".

**Trade-off conocido:** Posibles falsos positivos (ej: `src/api/**` vs `src/api-v2/**` se marcan como conflicto). Aceptable para MVP.
