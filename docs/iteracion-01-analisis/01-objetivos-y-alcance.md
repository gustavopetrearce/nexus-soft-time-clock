# 01 — Objetivos y alcance

## 1.1 Visión

> Permitir que las empresas registren la asistencia de su personal **sin relojes checadores físicos**, garantizando mediante QR + GPS + geocercas + antifraude que **solo se pueda registrar asistencia cuando el colaborador está físicamente dentro del sitio autorizado**, con evidencia y auditoría completas.

## 1.2 Objetivos de negocio

1. Eliminar la inversión y el mantenimiento de relojes checadores físicos.
2. Erradicar el fraude de asistencia (checar por otro, ubicación falsa, reutilización de QR).
3. Operar como plataforma **SaaS multi-empresa** (multi-tenant) con aislamiento de datos.
4. Soportar operación en campo **sin conexión** (offline-first) con sincronización confiable.
5. Dar a supervisores y RR.HH. visibilidad en tiempo real y reportería exportable.
6. Cumplir estándares empresariales de seguridad, auditoría y escalabilidad (miles de usuarios concurrentes, millones de registros).

## 1.3 Alcance — Dentro (In scope)

| # | Capacidad |
|---|---|
| A | Autenticación y autorización (JWT + refresh, RBAC, multi-tenant) |
| B | Registro de **Entrada / Salida / registros intermedios** vía QR + GPS + geocerca |
| C | Validaciones: precisión GPS, radio permitido, horario, turno, hora del **servidor** |
| D | Evidencia fotográfica **opcional** y biometría **opcional** |
| E | Antifraude: mock location, root/jailbreak, GPS off, apps spoofing, precisión insuficiente, reutilización de QR, replay |
| F | Offline-first: almacenamiento local, cola de sincronización, resolución de conflictos, reintentos, confirmación |
| G | Administración: empresas, usuarios, roles, centros de trabajo, proyectos, horarios, turnos, geocercas |
| H | Incidencias (retardos, faltas, permisos, justificaciones) |
| I | Auditoría completa de acciones (quién, cuándo, IP, dispositivo, valores antes/después) |
| J | Reportes exportables (Excel, PDF, CSV) con filtros avanzados |
| K | Dashboards y **mapa en tiempo real**; estado de sincronización |
| L | Notificaciones (push/email); monitoreo (Prometheus/Grafana) |
| M | Arquitectura preparada para IA futura (Spring AI) — sin funcionalidades de IA en esta fase |
| N | **Capacidad contratada por tenant**: cupo de colaboradores activos (150 de base) ampliable por bloques de 50, administrado por la plataforma |

## 1.4 Alcance — Fuera (Out of scope, fase inicial)

- Nómina / cálculo de pagos y dispersión bancaria (solo se exponen horas trabajadas/extra como insumo).
- Integraciones con ERPs/HRIS específicos (se deja la arquitectura preparada, sin conectores concretos).
- Funcionalidades de IA (predicción, detección inteligente de anomalías) — arquitectura preparada (Spring AI), implementación futura.
- OAuth2 con proveedores externos (Google/Microsoft): **preparado**, no habilitado en la fase inicial.
- App para dispositivos wearables / tablets kiosco compartido (se prioriza teléfono del empleado).

## 1.5 Catálogo de Requisitos Funcionales (RF)

| Código | Requisito | Origen (líneas prompt) |
|---|---|---|
| RF-01 | Autenticación de usuarios | 147 |
| RF-02 | Registro de Entrada | 148 |
| RF-03 | Registro de Salida | 149 |
| RF-04 | Registros intermedios (breaks, pausas, cambios de sitio) | 150 |
| RF-05 | Historial de asistencia del colaborador | 151 |
| RF-06 | Administración de usuarios | 152 |
| RF-07 | Administración de centros de trabajo | 153 |
| RF-08 | Administración de horarios y turnos | 154, 384 |
| RF-09 | Gestión de incidencias | 155 |
| RF-10 | Gestión de geocercas | 156 |
| RF-11 | Reportes exportables (Excel/PDF/CSV) con filtros | 157, 226-230 |
| RF-12 | Auditoría de acciones | 158, 232-243 |
| RF-13 | Multiempresa (multi-tenant) | 159 |
| RF-14 | Registro de asistencia vía QR | 163 |
| RF-15 | Validación GPS (ubicación, precisión, radio) | 164-166 |
| RF-16 | Validación de horario y turno | 167-168 |
| RF-17 | Uso de hora del servidor (no del dispositivo) | 169 |
| RF-18 | Evidencia fotográfica opcional | 170 |
| RF-19 | Biometría opcional (local authentication) | 171 |
| RF-20 | Prevención de fraude (mock, root, spoofing, replay, precisión) | 173-181 |
| RF-21 | Funcionamiento offline-first + sincronización | 183-191 |
| RF-22 | Administración de roles y permisos (RBAC) | 200, 383 |
| RF-23 | Administración de proyectos | 222, 383 |
| RF-24 | Dashboards administrativos | 210-223 |
| RF-25 | Mapa en tiempo real | 219 |
| RF-26 | Estado de sincronización (visibilidad admin) | 220 |
| RF-27 | Notificaciones (push/email) | 139, 389 |
| RF-28 | Validación del dispositivo (device binding) | 208 |
| RF-29 | Capacidad de colaboradores activos por tenant (cupo base + bloques) | Requerimiento 2026-10-14 |

> Los Requisitos No Funcionales (RNF-##) se detallan en [06 — Requisitos no funcionales](06-requisitos-no-funcionales.md).
