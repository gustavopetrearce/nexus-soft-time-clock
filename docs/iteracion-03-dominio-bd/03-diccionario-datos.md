# 03 — Diccionario de datos

Resumen de tablas por bounded context. El detalle autoritativo (columnas, tipos, CHECKs, índices) está en las migraciones [`db/migration/`](../../db/migration/).

## Tenancy (BC-02)
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `companies` | Empresa/tenant | `code`(UK), `email_domain`(UK), `timezone`, `status` |
| `company_settings` | Políticas por defecto del tenant | `default_gps_accuracy_max_m`, `*_policy`, `qr_ttl_seconds`, `max_failed_logins` |

## Identity & Access (BC-01)
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `users` | Cuentas de acceso | `tenant_id`, `is_platform_admin`, `email`, `password_hash`, `status`, `failed_login_count`, `locked_until` |
| `permissions` | Catálogo global RBAC | `code`(UK) = `recurso:acción` |
| `roles` | Roles por tenant / plantilla | `tenant_id`(NULL=plantilla), `code`, `is_system` |
| `role_permissions` | N:M rol↔permiso | PK compuesta |
| `user_roles` | N:M usuario↔rol | PK compuesta |
| `devices` | Device binding (RF-28) | `device_identifier`, `platform`, `is_trusted`, `push_token` |
| `refresh_tokens` | Rotación de sesión | `family_id`, `token_hash`(UK), `parent_id`, `revoked_at` |
| `user_work_site_scope` | Ámbito de supervisor (RN-33) | PK `(user_id, work_site_id)` |

## Organization (BC-03)
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `work_sites` | Centros de trabajo | `location`(geography+GIST), overrides de política |
| `projects` | Proyectos | `code`(UK/tenant), `status` |
| `project_work_sites` | N:M proyecto↔centro | PK compuesta |

## Scheduling (BC-04)
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `schedules` | Horarios | `config_json`, `timezone` |
| `shifts` | Turnos | `start_time`, `end_time`, `crosses_midnight`, `late_tolerance_min`, `window_before/after_min` |
| `shift_assignments` | Asignación con vigencia | `user_id`, `shift_id`, `valid_from/to` |

## Geofencing (BC-05)
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `geofences` | Geocerca circular/poligonal | `type`, `center`+`radius_m` / `area`, `is_active` |
| `site_qr_tokens` | QR firmado (ADR-006) | `nonce`, `key_id`, `expires_at`, `is_active` |

## Attendance / Anti-Fraud / Sync (BC-06/07/08)
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `attendance_records` | Registros (**particionada** por `server_time`) | `event_type`, `status`, `rejection_reason`, `location`, `gps_accuracy_m`, `qr_nonce` (traza), `operation_uuid`, `source`, `validations_json` |
| `idempotency_keys` | Idempotencia/offline (ADR-004) | `operation_uuid`(UK/tenant), `response_status` |
| `fraud_flags` | Banderas antifraude (RN-28) | `flag_type`, `is_blocking`, FK compuesta a asistencia |
| `work_days` | Read-model de jornada | `worked/overtime/late_minutes`, `status` |

## Incidents / Audit / Events / Notifications
| Tabla | Propósito | Columnas clave |
|---|---|---|
| `incidents` | Incidencias (BC-09) | `type`, `status`, `priority`, `resolved_by/at` |
| `audit_logs` | Bitácora **inmutable particionada** (BC-10) | `action`, `old_values`, `new_values`, `ip`, `user_agent`, `device_info` |
| `outbox_events` | Transactional Outbox (ADR-005) | `aggregate_type`, `event_type`, `payload`, `status` |
| `notifications` | Envíos push/email (BC-12) | `channel`, `type`, `status`, `read_at` |

## Tipos y convenciones transversales
- **Identificadores:** `uuid` (`gen_random_uuid()`).
- **Tiempo:** `timestamptz` en UTC.
- **Geo:** `geography(Point/Polygon, 4326)` + GIST.
- **Enums:** `varchar` + `CHECK` (evita rigidez de `ENUM` nativo; documentado en cada tabla).
- **Dinero/duraciones:** minutos como `integer`; distancias como `numeric`.
- **Documentos flexibles:** `jsonb` para `settings`, `validations`, `payload`, valores de auditoría.
