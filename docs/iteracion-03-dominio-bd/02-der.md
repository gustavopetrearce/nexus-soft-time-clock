# 02 — DER (Diagrama Entidad-Relación)

Modelo relacional normalizado. `tenant_id` presente en todas las tablas de negocio (omitido en el diagrama por brevedad salvo donde es FK relevante).

```mermaid
erDiagram
    companies ||--o| company_settings : "configura"
    companies ||--o{ users : "emplea"
    companies ||--o{ work_sites : "posee"
    companies ||--o{ projects : "tiene"
    companies ||--o{ schedules : "define"

    users ||--o{ user_roles : ""
    roles ||--o{ user_roles : ""
    roles ||--o{ role_permissions : ""
    permissions ||--o{ role_permissions : ""
    users ||--o{ devices : "registra"
    users ||--o{ refresh_tokens : "posee"
    users ||--o{ user_work_site_scope : "supervisa"
    work_sites ||--o{ user_work_site_scope : ""

    work_sites ||--o{ geofences : "delimita"
    work_sites ||--o{ site_qr_tokens : "emite"
    projects ||--o{ project_work_sites : ""
    work_sites ||--o{ project_work_sites : ""

    schedules ||--o{ shifts : "contiene"
    shifts ||--o{ shift_assignments : ""
    users ||--o{ shift_assignments : "asignado"

    users ||--o{ attendance_records : "registra"
    work_sites ||--o{ attendance_records : "en"
    geofences ||--o{ attendance_records : "valida"
    attendance_records ||--o{ fraud_flags : "marca"
    companies ||--o{ idempotency_keys : ""
    users ||--o{ work_days : "acumula"

    users ||--o{ incidents : "genera"
    companies ||--o{ audit_logs : "audita"
    companies ||--o{ outbox_events : ""
    users ||--o{ notifications : "recibe"

    companies {
        uuid id PK
        varchar code UK
        citext email_domain UK
        varchar timezone
        varchar status
    }
    users {
        uuid id PK
        uuid tenant_id FK
        boolean is_platform_admin
        citext email
        varchar password_hash
        varchar status
    }
    work_sites {
        uuid id PK
        uuid tenant_id FK
        varchar code
        geography location
        integer gps_accuracy_max_m
    }
    geofences {
        uuid id PK
        uuid work_site_id FK
        varchar type
        geography center
        numeric radius_m
        geography area
        boolean is_active
    }
    site_qr_tokens {
        uuid id PK
        uuid work_site_id FK
        varchar nonce
        varchar key_id
        timestamptz expires_at
    }
    attendance_records {
        uuid id PK
        timestamptz server_time PK
        uuid tenant_id
        uuid user_id
        uuid work_site_id
        varchar event_type
        varchar status
        varchar rejection_reason
        geography location
        numeric gps_accuracy_m
        varchar qr_nonce
        uuid operation_uuid
        varchar source
    }
    fraud_flags {
        uuid id PK
        uuid attendance_id FK
        timestamptz attendance_server_time FK
        varchar flag_type
        boolean is_blocking
    }
    idempotency_keys {
        uuid id PK
        uuid tenant_id FK
        uuid operation_uuid UK
        integer response_status
    }
    shifts {
        uuid id PK
        uuid schedule_id FK
        time start_time
        time end_time
        integer late_tolerance_min
    }
    incidents {
        uuid id PK
        uuid user_id FK
        varchar type
        varchar status
        uuid related_attendance_id
    }
    audit_logs {
        uuid id PK
        timestamptz created_at PK
        uuid tenant_id
        uuid actor_user_id
        varchar action
        jsonb old_values
        jsonb new_values
    }
    outbox_events {
        uuid id PK
        varchar aggregate_type
        varchar event_type
        jsonb payload
        varchar status
    }
```

> Nota: `attendance_records` y `audit_logs` tienen **PK compuesta** con la clave de partición (`server_time` / `created_at`). Las FKs hacia `attendance_records` (p.ej. `fraud_flags`) son **compuestas** por esta razón.
