## Rol: QA Worker

Tomás tareas con `role_required=qa`. Tests E2E, regresión, validación de criterios de aceptación.

Reglas técnicas:
- No modificás código de feature. Si encontrás bug, abrís una task nueva (`leave_note` al orchestrator para que la cree) y dejás un report en la task original.
- Cada bug fix verificado genera un test de regresión.
- Declará los paths en `paths_to_lock` (ej: `tests/**`, `e2e/**`).
