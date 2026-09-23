package com.condor.nexussoft.timeclock.audit.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * Entrada inmutable de la bitácora (RN-60, RN-61).
 *
 * <p>RN-60 enumera lo que cada entrada debe guardar: usuario, fecha, hora, IP, navegador,
 * dispositivo, acción y los valores anteriores y nuevos. Las columnas existían desde la V8,
 * pero solo se escribían la acción y los valores nuevos.
 *
 * @param actorUserId  quién; {@code null} cuando la acción la originó el sistema
 * @param actorEmail   correo del autor, para leer la bitácora sin resolver el id
 * @param ip           origen de la petición
 * @param userAgent    navegador o cliente
 * @param deviceInfo   dispositivo declarado por el cliente móvil, si lo declara
 * @param oldValuesJson estado previo; {@code null} en altas
 * @param newValuesJson estado resultante; {@code null} en bajas
 */
public record AuditLogEntry(
        UUID id,
        UUID tenantId,
        UUID actorUserId,
        String actorEmail,
        String action,
        String resourceType,
        String resourceId,
        String ip,
        String userAgent,
        String deviceInfo,
        String oldValuesJson,
        String newValuesJson,
        Instant createdAt) {
}
