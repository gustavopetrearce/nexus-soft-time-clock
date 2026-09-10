package com.condor.nexussoft.timeclock.geofencing.domain.port.out;

import com.condor.nexussoft.timeclock.geofencing.domain.SiteQrToken;

import java.util.UUID;

public interface SiteQrTokenRepositoryPort {

    /** Desactiva el QR activo previo del centro (rotación, ADR-006). */
    void deactivateActiveForSite(UUID workSiteId, UUID tenantId);

    /** Desactiva el QR de empresa activo previo (rotación del cartel sin centro). */
    void deactivateActiveForCompany(UUID tenantId);

    /**
     * ¿Sigue vigente el QR de empresa con este nonce? A diferencia del QR de un centro —colgado en
     * una puerta concreta y respaldado por la geocerca—, el de empresa sirve desde cualquier lugar,
     * así que su rotación debe invalidar de verdad al anterior y no solo dejar de imprimirlo.
     */
    boolean isActiveCompanyToken(UUID tenantId, String nonce);

    SiteQrToken save(SiteQrToken token);
}
