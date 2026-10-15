# Iteración 2 — Arquitectura y diagramas

**Objetivo:** definir la arquitectura de referencia de Nexus Soft Time Clock (estilos, capas, módulos, integración y despliegue) y documentar las decisiones clave como **ADRs**, usando el análisis de la Iteración 1 como insumo. **No se escribe código de negocio** en esta fase.

**Entregables**

| Doc | Contenido |
|---|---|
| [01 — Visión de arquitectura](01-vision-arquitectura.md) | Estilos, principios, arquitectura hexagonal, capas, decisiones transversales |
| [02 — C4 Nivel 1: Contexto](02-c4-contexto.md) | Sistema y actores/sistemas externos |
| [03 — C4 Nivel 2: Contenedores](03-c4-contenedores.md) | App, portal, backend, BD, infra |
| [04 — C4 Nivel 3: Componentes](04-c4-componentes.md) | Módulos internos del backend (bounded contexts) |
| [05 — Estructura modular del backend](05-estructura-modular-backend.md) | Layout hexagonal por módulo, reglas de dependencia |
| [06 — Diagramas de secuencia](06-diagramas-secuencia.md) | Login, registro de asistencia, sync offline, tiempo real |
| [07 — Modelo de eventos y CQRS](07-modelo-eventos-cqrs.md) | Eventos de dominio, read-models, integración interna |
| [08 — Despliegue (Docker / Kubernetes)](08-despliegue.md) | Topología de despliegue y escalado |
| [ADR](adr/) | Architecture Decision Records (ADR-001 … ADR-012) |

**Criterios de aceptación de la iteración**

- [ ] C4 niveles 1-3 documentados y coherentes con los 13 bounded contexts.
- [ ] Estructura hexagonal por módulo definida con reglas de dependencia explícitas.
- [ ] Diagramas de secuencia de los flujos críticos (auth, registro, sync).
- [ ] Modelo event-driven + CQRS descrito (base para desacoplar y evolucionar a microservicios).
- [ ] Topología de despliegue Docker/K8s con puntos de escalado.
- [ ] Decisiones arquitectónicas registradas como ADRs con estado y consecuencias.

> Los diagramas usan **Mermaid** (se renderizan en GitHub/visores compatibles). Los ADRs siguen el formato de Michael Nygard.
