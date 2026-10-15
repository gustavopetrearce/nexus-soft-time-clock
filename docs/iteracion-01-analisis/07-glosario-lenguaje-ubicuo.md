# 07 — Glosario / Lenguaje ubicuo (DDD)

Vocabulario compartido entre negocio y desarrollo. Estos términos serán los nombres de las entidades/agregados del modelo de dominio (Iteración 3).

| Término | Definición |
|---|---|
| **Tenant / Empresa (Company)** | Organización cliente de la plataforma. Unidad de aislamiento de datos multi-tenant. |
| **Colaborador (Employee)** | Persona que registra asistencia. Pertenece a un tenant. |
| **Usuario (User)** | Cuenta de acceso al sistema, con uno o más roles. Un colaborador tiene un usuario. |
| **Colaborador activo (ActiveCollaborator)** | Colaborador **habilitado para registrar accesos** (rol con `attendance:register` y cuenta no dada de baja), con independencia de su frecuencia de uso. Es la unidad que consume cupo (RN-35). |
| **Cupo / Capacidad contratada (TenantCapacity)** | Máximo de colaboradores activos de un tenant: cupo base (150) más los bloques adicionales contratados (RN-34). |
| **Bloque de capacidad (CapacityBlock)** | Incremento **indivisible** de 50 colaboradores activos sobre el cupo base; acumulativo y administrado por la plataforma (RF-29). |
| **Rol (Role)** | Conjunto nombrado de permisos (RBAC). |
| **Permiso (Permission)** | Autorización granular `recurso:acción`. |
| **Centro de trabajo (WorkSite)** | Ubicación física autorizada para registrar asistencia. Tiene coordenadas y geocerca. |
| **Proyecto (Project)** | Agrupación lógica de trabajo, opcionalmente asociada a centros/colaboradores. |
| **Geocerca (Geofence)** | Área geográfica válida para registrar: círculo (centro + radio) o polígono. |
| **Horario (Schedule)** | Definición de jornada esperada (horas, días). |
| **Turno (Shift)** | Instancia/asignación de horario a un colaborador en un rango temporal, con tolerancias. |
| **Registro de asistencia (AttendanceRecord)** | Evento de marcación: ENTRADA, SALIDA o intermedio, con GPS, hora de servidor y resultado de validación. |
| **Tipo de evento (AttendanceEventType)** | ENTRADA · SALIDA · INICIO_DESCANSO · FIN_DESCANSO · CAMBIO_SITIO (extensible). |
| **Jornada (WorkDay)** | Secuencia de eventos de un colaborador entre una ENTRADA y su SALIDA. |
| **QR de centro (SiteQrToken)** | Token firmado con vigencia y `nonce` que representa a un centro para el escaneo. |
| **Evidencia (Evidence)** | Foto u otro adjunto asociado a un registro, almacenado de forma segura (MinIO). |
| **Bandera antifraude (FraudFlag)** | Indicador de una condición sospechosa detectada (mock location, root, spoofing, replay…). |
| **Incidencia (Incident)** | Situación que requiere atención: retardo, falta, registro rechazado, justificación, permiso. |
| **Operación de sincronización (SyncOperation)** | Registro creado offline con UUID, encolado para envío idempotente al servidor. |
| **Cola de sincronización (SyncQueue)** | Estructura local (móvil) que almacena operaciones pendientes de enviar. |
| **Evento de dominio (DomainEvent)** | Hecho de negocio publicado para desacoplar contextos (p.ej. `AttendanceRegistered`). |
| **Registro de auditoría (AuditLog)** | Entrada inmutable que documenta una acción (quién, cuándo, qué, antes/después). |
| **Ventana de registro (RegistrationWindow)** | Rango temporal alrededor del turno en el que se admite una marcación. |
| **Precisión (Accuracy)** | Radio de incertidumbre del fix GPS, en metros; debe ser ≤ umbral del centro. |
| **Hora de servidor (ServerTime)** | Marca temporal autoritativa fijada por el backend al procesar un registro. |
