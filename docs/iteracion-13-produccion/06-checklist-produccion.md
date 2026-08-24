# 06 — Checklist de preparación para producción

## Seguridad
- [ ] Llave de firma **JWT** desde keystore/secreto persistente (no la generada en memoria del perfil dev) — [ADR-007].
- [ ] `SECURITY_QR_SECRET` fuerte y rotado; política de rotación de QR por centro definida.
- [ ] HTTPS/TLS obligatorio en el Ingress (cert-manager); HSTS.
- [ ] Rate limiting perimetral (NGINX) + por aplicación (Redis) afinado.
- [ ] Secretos en Vault/Secret Manager (no en imágenes ni repo).
- [ ] Autorización por destino en **WebSocket** (interceptor STOMP que valide tenant/ámbito).
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
- [ ] Registro de auditoría inmutable verificado (triggers anti UPDATE/DELETE).

> Estado actual: la plataforma está **funcionalmente completa** y **compila/pasa pruebas unitarias**. Esta checklist enumera el endurecimiento restante antes del go-live; los puntos marcados como "preparado" en la arquitectura (ADR) tienen el diseño hecho y requieren activación/afinado operativo.
