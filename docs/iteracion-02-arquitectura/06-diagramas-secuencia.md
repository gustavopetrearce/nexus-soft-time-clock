# 06 — Diagramas de secuencia (flujos críticos)

## 6.1 Autenticación (login + refresh rotatorio)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant M as App/Portal
    participant GW as NGINX
    participant API as Backend (IAM)
    participant R as Redis
    participant DB as PostgreSQL

    U->>M: credenciales + empresa
    M->>GW: POST /api/v1/auth/login
    GW->>API: forward (TLS)
    API->>DB: buscar usuario (por tenant)
    API->>R: verificar rate limit / lockout (RN-40)
    API->>API: validar password (bcrypt/argon2)
    API->>DB: guardar refreshToken (familia)
    API-->>M: 200 {accessToken(15m), refreshToken}
    Note over M: access en memoria, refresh en secure storage

    U->>M: (access expira)
    M->>API: POST /api/v1/auth/refresh {refreshToken}
    API->>DB: validar refresh (no revocado)
    alt refresh reutilizado
        API->>DB: revocar familia completa (RN-41)
        API-->>M: 401 (posible robo)
    else válido
        API->>DB: rotar refresh
        API-->>M: 200 nuevo par de tokens
    end
```

## 6.2 Registro de asistencia (entrada) — flujo núcleo (CU-02)

```mermaid
sequenceDiagram
    autonumber
    actor E as Colaborador
    participant M as App Flutter
    participant L as Drift (local)
    participant GW as NGINX
    participant AT as Attendance UseCase
    participant GEO as Geofencing
    participant SCH as Scheduling
    participant FR as Anti-Fraud
    participant R as Idempotencia (operation_uuid)
    participant DB as PostgreSQL
    participant OB as Outbox/EventBus

    E->>M: Registrar entrada
    M->>M: Antifraude local (mock/root/GPS/precisión)
    opt biometría requerida
        M->>M: Local Authentication (huella/rostro)
    end
    M->>M: Escanear QR (token firmado) + capturar GPS (+foto)
    M->>L: Persistir operación (UUID) [offline-first]
    M->>GW: POST /api/v1/attendance {UUID, qr, gps, ...}  (Idempotency-Key: UUID)
    GW->>AT: forward (JWT → tenant, RN-31)
    AT->>R: ¿operation_uuid ya procesado? (idempotencia RN-51)
    alt duplicado
        AT-->>M: 200 (resultado previo, sin reprocesar)
    else nuevo
        AT->>GEO: validar QR firmado + geocerca (RN-13, RN-25)
        AT->>SCH: validar horario/turno (RN-15, RN-16)
        AT->>FR: evaluar banderas antifraude (RN-20..RN-28)
        AT->>DB: leer último evento aceptado → validar secuencia (RN-12)
        AT->>AT: fijar hora de servidor (RN-11) + resolver resultado
        AT->>DB: persistir AttendanceRecord (aceptado/rechazado+motivo, con qr_nonce)
        AT->>R: guardar resultado por operation_uuid
        AT->>OB: publicar AttendanceRegistered (transaccional)
        AT-->>M: 200 {resultado, serverTime, motivo?}
    end
    M->>L: actualizar estado local (sincronizado)
    OB-->>OB: → Audit, Notifications, Reporting, Realtime (async)
```

## 6.3 Sincronización offline (lote) — CU-05

```mermaid
sequenceDiagram
    autonumber
    participant M as App (cola sync)
    participant GW as NGINX
    participant SY as Offline Sync
    participant AT as Attendance
    participant DB as PostgreSQL

    Note over M: Recupera conectividad
    M->>GW: POST /api/v1/sync/attendance [batch de operaciones con UUID]
    GW->>SY: forward
    loop por cada operación (FIFO)
        SY->>AT: procesar (idempotente, hora de servidor)
        AT->>DB: validar + persistir (RN-53)
        AT-->>SY: resultado {ACEPTADO|RECHAZADO|INCIDENCIA}
    end
    SY-->>M: 200 [resultados por UUID] (confirmación RN-54)
    M->>M: actualizar estados; reintentar fallidos con backoff (RN-52)
```

## 6.4 Monitoreo en tiempo real (CU-11)

```mermaid
sequenceDiagram
    autonumber
    actor S as Supervisor
    participant SPA as Portal Angular
    participant WS as WebSocket (STOMP)
    participant OB as EventBus
    participant AT as Attendance

    S->>SPA: abre mapa/dashboard
    SPA->>WS: SUBSCRIBE /topic/tenant/{id}/attendance (JWT)
    AT->>OB: AttendanceRegistered
    OB->>WS: proyectar a suscriptores del tenant/ámbito
    WS-->>SPA: evento (ubicación agregada, estado)
    SPA->>S: actualiza mapa/indicadores en vivo
```
