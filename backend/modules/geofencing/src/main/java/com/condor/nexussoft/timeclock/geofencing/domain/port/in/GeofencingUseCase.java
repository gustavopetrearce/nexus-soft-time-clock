package com.condor.nexussoft.timeclock.geofencing.domain.port.in;

import com.condor.nexussoft.timeclock.geofencing.domain.Geofence;
import com.condor.nexussoft.timeclock.geofencing.domain.QrPayload;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Geocercas por centro y ciclo de vida del QR firmado (RF-10, RF-14). */
public interface GeofencingUseCase {

    /** QR generado devuelto al administrador: cadena firmada + vigencia. */
    record GeneratedQr(String token, Instant expiresAt) {
    }

    Geofence upsertGeofence(UUID tenantId, UUID workSiteId, double latitude, double longitude, double radiusM);

    Geofence getGeofence(UUID tenantId, UUID workSiteId);

    /**
     * Búsqueda no excepcional de la geocerca activa del centro. Devuelve vacío si no hay
     * geocerca configurada (condición de negocio normal, no un error). Pensada para flujos
     * que participan en una transacción externa —p. ej. el registro de asistencia—, donde
     * lanzar una excepción marcaría la transacción como rollback-only.
     */
    Optional<Geofence> findGeofence(UUID tenantId, UUID workSiteId);

    /**
     * Genera/rota el QR firmado del centro. {@code ttlMinutes} define la vigencia en minutos
     * (hasta 24h); {@code expiresAt} fija una fecha exacta de expiración para vigencias más
     * largas (días/semanas/meses) y, si viene informado, tiene prioridad sobre {@code ttlMinutes}.
     * Si ninguno viene informado, se aplica la duración por defecto configurada.
     */
    GeneratedQr generateQr(UUID tenantId, UUID workSiteId, Integer ttlMinutes, Instant expiresAt);

    /**
     * Genera/rota el <b>QR de empresa</b>: el que no pertenece a ningún centro y habilita el
     * registro sin validación de geocerca (camino opcional de RF-15). Mismas reglas de vigencia
     * que {@link #generateQr}. Rotarlo invalida el anterior de verdad —{@code is_active} se
     * comprueba al verificar—, porque este cartel sirve desde cualquier ubicación.
     */
    GeneratedQr generateCompanyQr(UUID tenantId, Integer ttlMinutes, Instant expiresAt);

    /** Verifica firma y vigencia del QR; el consumo del nonce (anti-replay) ocurre al registrar (BC-06). */
    QrPayload verifyQr(String token);
}
