# Nexus Soft Time Clock

Plataforma empresarial **multi-tenant** de Control de Asistencia sin relojes checadores físicos.
El registro de asistencia se realiza mediante **Código QR + GPS + Geocercas + validaciones antifraude + evidencias**, garantizando que un colaborador solo pueda registrar asistencia cuando se encuentra **físicamente dentro del sitio autorizado**.

> Organización base de paquetes: `com.condor.nexussoft.timeclock`

---

## Componentes de la solución

| Componente | Tecnología | Destinatario |
|---|---|---|
| App móvil | Flutter (Dart, Riverpod, GoRouter, Dio, Drift, Offline-First) | Empleados |
| Portal web | Angular (Material, Signals, PWA) | Supervisores / Administradores |
| Backend | Java 21 · Spring Boot 3.x · REST | — |
| Base de datos | PostgreSQL (índices espaciales) | — |
| Infraestructura | Docker · K8s-ready · NGINX · Redis · MinIO · Prometheus · Grafana | — |

## Principios de arquitectura

Modular Monolith · Hexagonal Architecture · Domain-Driven Design · CQRS · Event-Driven · SOLID · Repository Pattern.
Diseñado para **evolucionar a microservicios sin reescribir el código**.

---

## Estructura del repositorio (destino)

```
nexus-soft-time-clock/
├── backend/        # Spring Boot — modular monolith (bounded contexts)
├── web/            # Angular — portal administrativo (PWA)
├── mobile/         # Flutter — app de empleados (offline-first)
├── infra/          # docker-compose, nginx, k8s, prometheus, grafana
├── db/             # scripts SQL, DER, migraciones de referencia
└── docs/           # análisis, arquitectura (C4/ADR), dominio, trazabilidad
```

## Hoja de ruta por iteraciones

El desarrollo es **incremental**; cada iteración debe quedar funcional, compilable y probada antes de avanzar.

| # | Iteración | Estado |
|---|---|---|
| 1 | Análisis funcional y refinamiento de requisitos | ✅ Completada |
| 2 | Arquitectura y diagramas (C4, ADR) | ✅ Completada |
| 3 | Modelo de dominio y base de datos | ✅ Completada |
| 4 | Configuración del repositorio y esqueleto de proyectos | ✅ Completada |
| 5 | Autenticación y autorización | ✅ Completada |
| 6 | Empresas, usuarios, roles y centros de trabajo | ✅ Completada |
| 7 | Horarios, turnos y geocercas | ✅ Completada |
| 8 | Registro de asistencia (QR, GPS, validaciones) | ✅ Completada |
| 9 | Sincronización offline y resolución de conflictos | ✅ Completada |
| 10 | Incidencias, auditoría y reglas de negocio | ✅ Completada |
| 11 | Reportes, dashboards y monitoreo en tiempo real | ✅ Completada |
| 12 | Notificaciones, integraciones y optimización | ✅ Completada |
| 13 | Pruebas, documentación y preparación para producción | ✅ Completada |
| 14 | Tipos de contrato por colaborador (proyecto / turno) | ✅ Completada (contratos, marcación, reportes y móvil) |
| 15 | Importación masiva de usuarios (CSV / XLSX) | ✅ Completada (portal + módulo onboarding) |

> **Estado:** las 13 iteraciones están completas. El backend (16 módulos) compila y sus **23 pruebas unitarias pasan**; el portal Angular compila. La verificación en runtime (JDK 21 + Docker) queda lista vía `mvn verify` y `docker compose up`. Ver [`docs/iteracion-13-produccion`](docs/iteracion-13-produccion/).

## Inicio rápido

```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d --build
# Portal http://localhost:8081 · API http://localhost:8080/api/v1 · Swagger /swagger-ui.html
```
Guía completa: [`docs/iteracion-13-produccion/01-guia-instalacion-desarrollo.md`](docs/iteracion-13-produccion/01-guia-instalacion-desarrollo.md).

## Documentación

- [`docs/iteracion-01-analisis/`](docs/iteracion-01-analisis/) — Análisis funcional (RF, HU, RN, CU, bounded contexts, trazabilidad)
- [`docs/iteracion-02-arquitectura/`](docs/iteracion-02-arquitectura/) — Arquitectura (C4, hexagonal, secuencia, eventos/CQRS, despliegue, ADRs)
- [`docs/iteracion-03-dominio-bd/`](docs/iteracion-03-dominio-bd/) — Modelo de dominio, DER, diccionario de datos, índices/particionamiento
- [`db/migration/`](db/migration/) — Migraciones Flyway V1–V10 (PostgreSQL + PostGIS)
- [`docs/iteracion-04-estructura/`](docs/iteracion-04-estructura/) — Estructura del monorepo, cómo ejecutar, estado de verificación
- [`docs/iteracion-05-autenticacion/`](docs/iteracion-05-autenticacion/) — Autenticación JWT + refresh, RBAC, multi-tenant (backend + web + móvil)
- [`docs/iteracion-06-admin/`](docs/iteracion-06-admin/) — CRUD de empresas, usuarios/roles y centros de trabajo/proyectos (BC-02/03 + admin BC-01)
- [`docs/iteracion-07-horarios-geocercas/`](docs/iteracion-07-horarios-geocercas/) — Horarios/turnos (BC-04) y geocercas + QR firmado (BC-05)
- [`docs/iteracion-08-registro-asistencia/`](docs/iteracion-08-registro-asistencia/) — **Núcleo**: registro de asistencia QR+GPS+geocerca+antifraude+idempotencia (BC-06/07)
- [`docs/iteracion-09-sync-offline/`](docs/iteracion-09-sync-offline/) — Sincronización offline por lotes (BC-08) + cola local Drift en Flutter
- [`docs/iteracion-10-incidencias-auditoria/`](docs/iteracion-10-incidencias-auditoria/) — Auditoría (BC-10) e incidencias (BC-09) event-driven
- [`docs/iteracion-11-reportes-dashboards/`](docs/iteracion-11-reportes-dashboards/) — Dashboards + export Excel/PDF/CSV (BC-11) y WebSocket tiempo real (BC-13)
- [`docs/iteracion-12-notificaciones-optimizacion/`](docs/iteracion-12-notificaciones-optimizacion/) — Notificaciones (BC-12), Transactional Outbox y caché Redis
- [`docs/iteracion-13-produccion/`](docs/iteracion-13-produccion/) — **Guías** (instalación, despliegue), **manuales** (usuario, admin), estrategia de pruebas y checklist de producción
- [`docs/iteracion-14-contratos/`](docs/iteracion-14-contratos/) — Evaluación de tipos de contrato (proyecto / turno) e impacto del módulo de proyectos
- [`docs/iteracion-15-importacion-usuarios/`](docs/iteracion-15-importacion-usuarios/) — Importación masiva de usuarios: estructura del archivo, reglas y API

---
_Proyecto en construcción iterativa. Ver `promt_001.txt` para la especificación original._
