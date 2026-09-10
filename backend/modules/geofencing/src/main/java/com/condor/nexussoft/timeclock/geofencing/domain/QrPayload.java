package com.condor.nexussoft.timeclock.geofencing.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * Contenido firmado de un QR.
 *
 * <p>{@code workSiteId} nulo identifica un <b>QR de empresa</b>: el cartel no pertenece a ningún
 * centro y habilita el camino de registro sin geocerca (RF-15, camino opcional). Un QR de centro
 * lleva siempre su identificador.</p>
 */
public record QrPayload(UUID tenantId, UUID workSiteId, String nonce, Instant expiresAt) {

    /** {@code true} si el QR no está atado a ningún centro de trabajo. */
    public boolean isCompanyWide() {
        return workSiteId == null;
    }
}
