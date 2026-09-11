# 09 — Matriz de trazabilidad

Traza cada **Requisito Funcional (RF)** con sus **Historias (HU)**, **Reglas de negocio (RN)**, **Casos de uso (CU)** y **Bounded Context (BC)**. Garantiza que ningún requisito de `promt_001.txt` queda sin cobertura.

| RF | Descripción | HU | RN | CU | BC |
|---|---|---|---|---|---|
| RF-01 | Autenticación | HU-01, HU-02, HU-03 | RN-40, RN-41 | CU-01 | BC-01 |
| RF-02 | Registro de entrada | HU-10 | RN-10..RN-17 | CU-02 | BC-06 |
| RF-03 | Registro de salida | HU-11 | RN-12, RN-17 | CU-03 | BC-06 |
| RF-04 | Registros intermedios | HU-12 | RN-12 | CU-04 | BC-06 |
| RF-05 | Historial | HU-16 | — | — | BC-06, BC-11 |
| RF-06 | Administración de usuarios | HU-21 | RN-32, RN-43 | (CRUD estándar) | BC-01 |
| RF-07 | Centros de trabajo | HU-22 | RN-43 | CU-06 | BC-03 |
| RF-08 | Horarios y turnos | HU-24 | RN-15, RN-16 | (CRUD estándar) | BC-04 |
| RF-09 | Incidencias | HU-26 | RN-16, RN-43, RN-60 | CU-08 | BC-09 |
| RF-10 | Geocercas | HU-23 | RN-13, RN-14, RN-18 | CU-06 | BC-05 |
| RF-11 | Reportes exportables | HU-33 | RN-30 | CU-09 | BC-11 |
| RF-12 | Auditoría | HU-34 | RN-60, RN-61, RN-62 | CU-10 | BC-10 |
| RF-13 | Multiempresa | HU-20 | RN-30, RN-31, RN-32 | — | BC-02 |
| RF-14 | Registro vía QR | HU-10, HU-17, HU-25 | RN-25, RN-26, RN-19 | CU-02, CU-07 | BC-05, BC-06 |
| RF-15 | Validación GPS | HU-10, HU-17 | RN-13, RN-14, RN-18 | CU-02 | BC-06 |
| RF-16 | Validación horario/turno | HU-10, HU-24 | RN-15, RN-16 | CU-02 | BC-04, BC-06 |
| RF-17 | Hora del servidor | HU-10, HU-15 | RN-11 | CU-02, CU-05 | BC-06 |
| RF-18 | Evidencia fotográfica | HU-13, HU-17 | RN-10, RN-18 | CU-02 | BC-06 |
| RF-19 | Biometría opcional | HU-14 | RN-10 | CU-02 | BC-06 |
| RF-20 | Prevención de fraude | HU-10, HU-15 | RN-20..RN-28 | CU-02 | BC-07 |
| RF-21 | Offline + sincronización | HU-15 | RN-50..RN-54 | CU-05 | BC-08 |
| RF-22 | Roles y permisos (RBAC) | HU-21 | RN-30..RN-33 | (CRUD estándar) | BC-01 |
| RF-23 | Proyectos | HU-22 | RN-43 | (CRUD estándar) | BC-03 |
| RF-24 | Dashboards | HU-30 | RN-30 | CU-11 | BC-11, BC-13 |
| RF-25 | Mapa en tiempo real | HU-31 | RN-33 | CU-11 | BC-13 |
| RF-26 | Estado de sincronización | HU-32 | RN-54 | CU-05, CU-11 | BC-08, BC-13 |
| RF-27 | Notificaciones | HU-35 | RN-43 | — | BC-12 |
| RF-28 | Validación del dispositivo | HU-10 | RN-27 | CU-02 | BC-01, BC-07 |

**Cobertura:** 28/28 RF trazados. Sin requisitos huérfanos.
