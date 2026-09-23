# 06 — Checklist de preparación para producción

## Seguridad
- [ ] Llave de firma **JWT** desde keystore/secreto persistente (no la generada en memoria del perfil dev) — [ADR-007].
- [ ] `SECURITY_QR_SECRET` fuerte y rotado; política de rotación de QR por centro definida.
- [~] HTTPS/TLS: **preparado, pendiente de activar en el servidor**. El NGINX del stack sirve
  443 con TLS 1.2/1.3, redirección 80→301 y HSTS de un año en cuanto se le montan
  certificados (`TLS_CERTS_DIR`); sin ellos arranca en HTTP y lo avisa por log. Queda
  emitir el certificado del dominio y poner `PUBLIC_BASE_URL` en `https://`
  (ver [07 §3.1](07-despliegue-portainer.md)).
- [ ] Rate limiting perimetral (NGINX, 20 r/s por IP) + por aplicación (Redis) — lo segundo
  **no existe** pese a lo que dice el comentario de `nginx.conf`.
- [x] Superficie del actuator cerrada: NGINX solo publica `/actuator/health` y
  `/actuator/prometheus` exige credencial propia (`SECURITY_METRICS_PASSWORD`); sin ella el
  endpoint queda cerrado en lugar de abierto.
- [ ] Secretos en Vault/Secret Manager (no en imágenes ni repo).
- [x] Autorización por destino en **WebSocket**: `StompAuthorizationInterceptor` autentica la
  trama CONNECT con el mismo JWT de la API y rechaza toda suscripción cuyo destino no sea
  `/topic/tenant/{tenant del token}/…`, exigiendo además `dashboard:read`. El handshake de
  `/ws` sigue siendo anónimo porque ni WebSocket ni SockJS pueden enviar `Authorization`.
- [ ] Revisión de dependencias (SCA) y escaneo de imágenes.
- [x] Cifrado en reposo de evidencias (MinIO SSE-S3, aplicado al bucket por `StorageBucketInitializer` al arrancar). Requiere `MINIO_KMS_SECRET_KEY` en el contenedor de MinIO: sin ella el bucket queda **sin cifrar** y el backend lo avisa por log.
- [ ] Cifrado en reposo del resto de datos sensibles; política de datos biométricos (RNF-22).

## Fiabilidad / datos
- [ ] Backups automatizados de PostgreSQL + prueba de restauración.
- [ ] **Particionamiento** de `attendance_records`/`audit_logs`: job que crea particiones futuras (`fn_create_monthly_partition`) y política de retención.
- [ ] **Outbox**: monitoreo del backlog y de `status='FAILED'` (dead-letter); ShedLock para el relay en multi-réplica.
- [ ] Idempotencia y limpieza por TTL de `idempotency_keys`.

## Escalabilidad / rendimiento
- [ ] HPA del backend configurado; pruebas de carga del endpoint de registro (p95 < 400 ms, RNF-01).
- [ ] Índices verificados (GIST espaciales, compuestos `tenant_id`); plan de consultas del dashboard/reportes.
- [ ] Caché Redis afinada (TTL, invalidación).

## Observabilidad
- [ ] Dashboards Grafana (latencia, throughput, rechazos, backlog outbox, errores).
- [ ] Alertas y on-call; logs estructurados con correlación.
- [ ] Trazas distribuidas (preparado para OpenTelemetry).

## Operación
- [ ] Migraciones **compatibles hacia atrás** (expand/contract) para zero-downtime.
- [ ] Runbooks (incidentes, rotación de llaves, restauración).
- [ ] Multi-tenant: pruebas de **fuga entre tenants** (negativas) en CI; evaluar PostgreSQL RLS como segunda barrera.

## Cumplimiento
- [ ] Consentimiento y minimización de datos personales/biométricos; políticas de retención.
- [x] Registro de auditoría inmutable verificado: `UPDATE` y `DELETE` sobre `audit_logs`
  se rechazan con «Tabla append-only» (trigger `fn_block_mutation`), comprobado contra
  PostgreSQL real.

> Estado actual: la plataforma está **funcionalmente completa** y **compila/pasa pruebas unitarias**. Esta checklist enumera el endurecimiento restante antes del go-live; los puntos marcados como "preparado" en la arquitectura (ADR) tienen el diseño hecho y requieren activación/afinado operativo.
