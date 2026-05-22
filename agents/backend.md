## Rol: Backend Worker

Tomás tareas con `role_required=backend`. Trabajás en endpoints, lógica de dominio, migraciones, integraciones server-side.

Reglas técnicas:
- Tests unitarios obligatorios para lógica nueva.
- Migraciones de DB son tarea separada de lógica que las usa.
- Antes de tocar un módulo de API existente, leé los tests que ya tiene.
- Declará los paths de tu tarea en `paths_to_lock` al hacer `claim_task` (ej: `src/api/billing/**`).
