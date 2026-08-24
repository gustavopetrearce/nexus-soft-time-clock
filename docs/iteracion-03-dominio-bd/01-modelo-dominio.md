# 01 — Modelo de dominio

Modelo por bounded context (DDD). Cada **agregado** tiene una raíz que garantiza sus **invariantes**; las referencias entre agregados son por **identidad (id)**, no por objeto, para mantener límites transaccionales pequeños.

## 1.1 Attendance (BC-06) — núcleo

```mermaid
classDiagram
    class AttendanceRecord {
        <<Aggregate Root>>
        +UUID id
        +TenantId tenantId
        +UserId userId
        +WorkSiteId workSiteId
        +AttendanceEventType eventType
        +GpsFix gps
        +Instant serverTime
        +AttendanceStatus status
        +RejectionReason? reason
        +OperationUuid operationUuid
        +Evidence? evidence
        +register() ValidationResult
    }
    class GpsFix {
        <<Value Object>>
        +double lat
        +double lng
        +double accuracyM
    }
    class Evidence {
        <<Value Object>>
        +String bucket
        +String key
        +String hash
    }
    class ValidationResult {
        <<Value Object>>
        +boolean accepted
        +RejectionReason? reason
        +List~FraudFlag~ flags
    }
    class WorkDay {
        <<Aggregate Root>>
        +UUID id
        +LocalDate date
        +int workedMinutes
        +int overtimeMinutes
        +int lateMinutes
    }
    AttendanceRecord --> GpsFix
    AttendanceRecord --> Evidence
    AttendanceRecord ..> ValidationResult
```

**Invariantes clave:**
- `serverTime` lo fija el dominio con `ServerClockPort` (RN-11); nunca el cliente.
- Un `AttendanceRecord` aceptado exige `ValidationResult.accepted == true` (RN-10).
- La secuencia de eventos por jornada debe ser válida (RN-12); se valida contra la `WorkDay` abierta.
- `operationUuid` es único por tenant → idempotencia (RN-51).

## 1.2 Geofencing (BC-05)

```mermaid
classDiagram
    class Geofence {
        <<Aggregate Root>>
        +UUID id
        +WorkSiteId workSiteId
        +GeofenceType type
        +GeoPoint? center
        +double? radiusM
        +GeoPolygon? area
        +boolean active
        +contains(GpsFix) boolean
    }
    class SiteQrToken {
        <<Aggregate Root>>
        +UUID id
        +WorkSiteId workSiteId
        +String nonce
        +String keyId
        +Instant issuedAt
        +Instant expiresAt
        +boolean active
        +verify(signature, now) boolean
    }
    Geofence --> "0..1" GeoPoint : center
```

**Invariantes:** una geocerca CIRCLE requiere `center`+`radiusM`; POLYGON requiere `area` (CHECK `ck_geofence_shape`). Solo una geocerca **activa** por centro. Un `SiteQrToken` es válido si firma correcta + no expirado (RN-25); su `nonce` no se consume — el mismo QR sirve para todos los eventos de la jornada y queda como traza en el registro (RN-26).

## 1.3 Identity & Access (BC-01)

```mermaid
classDiagram
    class User {
        <<Aggregate Root>>
        +UUID id
        +TenantId? tenantId
        +Email email
        +PasswordHash passwordHash
        +UserStatus status
        +int failedLoginCount
        +assignRole(Role)
        +lock()
    }
    class Role {
        <<Aggregate Root>>
        +UUID id
        +String code
        +Set~Permission~ permissions
    }
    class Permission {
        <<Value Object>>
        +String code
        +String resource
        +String action
    }
    class RefreshToken {
        <<Entity>>
        +UUID id
        +UUID familyId
        +String tokenHash
        +Instant expiresAt
        +rotate() RefreshToken
        +revokeFamily()
    }
    class Device {
        <<Aggregate Root>>
        +UUID id
        +String deviceIdentifier
        +boolean trusted
    }
    User "1" --> "*" Role
    Role "1" --> "*" Permission
    User "1" --> "*" RefreshToken
```

**Invariantes:** `tenantId` nulo solo para SUPER_ADMIN de plataforma (RN-32, CHECK `ck_users_tenant_scope`). La reutilización de un `RefreshToken` revoca su `familyId` (RN-41).

## 1.4 Resto de contextos (resumen)

| BC | Agregado raíz | Invariantes destacadas |
|---|---|---|
| Tenancy (BC-02) | `Company` | `code`/`emailDomain` únicos; settings por defecto |
| Organization (BC-03) | `WorkSite`, `Project` | `WorkSite` tiene `location` obligatoria; `code` único por tenant |
| Scheduling (BC-04) | `Schedule` (con `Shift`) | tolerancias ≥ 0; ventana de registro coherente |
| Anti-Fraud (BC-07) | `FraudPolicy` | política por tenant/centro; produce `FraudFlag` (VO) |
| Offline Sync (BC-08) | `SyncOperation` | procesamiento idempotente por `operationUuid` |
| Incidents (BC-09) | `Incident` | transición de estado OPEN→APPROVED/REJECTED/RESOLVED audita |
| Audit (BC-10) | `AuditLog` | inmutable (append-only, RN-61) |
| Notifications (BC-12) | `Notification` | canal válido; ciclo PENDING→SENT/FAILED/READ |

> Estas clases guían las entidades JPA (adaptador de persistencia) y los mappers MapStruct de la Iteración 4+. El **dominio no depende de JPA**: las entidades de persistencia son un detalle de infraestructura (ADR-001).
