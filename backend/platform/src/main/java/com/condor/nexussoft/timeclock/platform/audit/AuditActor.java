package com.condor.nexussoft.timeclock.platform.audit;

import java.util.UUID;

/**
 * Autor de una acción auditable: los datos que RN-60 exige guardar junto a cada escritura
 * (usuario, IP, navegador/user-agent y dispositivo).
 *
 * <p>Todos los campos son opcionales salvo por convención: una acción del sistema (siembra de
 * datos, job programado) no tiene usuario ni IP, y eso también es información.
 *
 * @param userId    usuario autenticado, {@code null} si la acción la originó el sistema
 * @param email     correo del usuario, para que la bitácora se lea sin resolver el id
 * @param ip        IP de origen, ya desenredada de las cabeceras de proxy
 * @param userAgent navegador o cliente declarado
 * @param device    dispositivo, cuando el cliente móvil lo declara
 */
public record AuditActor(UUID userId, String email, String ip, String userAgent, String device) {

    /** Acción sin autor identificable: arranque, siembra o job interno. */
    public static final AuditActor SYSTEM = new AuditActor(null, null, null, null, null);

    public static AuditActor ofUser(UUID userId, String email, String ip, String userAgent, String device) {
        return new AuditActor(userId, email, ip, userAgent, device);
    }
}
