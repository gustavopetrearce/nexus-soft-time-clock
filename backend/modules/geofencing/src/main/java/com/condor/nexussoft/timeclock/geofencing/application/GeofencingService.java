package com.condor.nexussoft.timeclock.geofencing.application;

import com.condor.nexussoft.timeclock.geofencing.domain.Geofence;
import com.condor.nexussoft.timeclock.geofencing.domain.GeoPoint;
import com.condor.nexussoft.timeclock.geofencing.domain.QrPayload;
import com.condor.nexussoft.timeclock.geofencing.domain.SiteQrToken;
import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.GeofenceRepositoryPort;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.QrTokenSignerPort;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.SiteQrTokenRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

@Service
public class GeofencingService implements GeofencingUseCase {

    private static final String KEY_ID = "v1";

    private final GeofenceRepositoryPort geofences;
    private final SiteQrTokenRepositoryPort qrTokens;
    private final QrTokenSignerPort signer;
    private final Clock clock;
    private final long qrTtlSeconds;
    private final long qrMaxFarExpiryDays;
    private final SecureRandom random = new SecureRandom();

    public GeofencingService(GeofenceRepositoryPort geofences, SiteQrTokenRepositoryPort qrTokens,
                             QrTokenSignerPort signer, Clock clock,
                             @Value("${security.qr.ttl-seconds:120}") long qrTtlSeconds,
                             @Value("${security.qr.max-far-expiry-days:366}") long qrMaxFarExpiryDays) {
        this.geofences = geofences;
        this.qrTokens = qrTokens;
        this.signer = signer;
        this.clock = clock;
        this.qrTtlSeconds = qrTtlSeconds;
        this.qrMaxFarExpiryDays = qrMaxFarExpiryDays;
    }

    @Override
    @Transactional
    public Geofence upsertGeofence(UUID tenantId, UUID workSiteId, double lat, double lng, double radiusM) {
        GeoPoint center = new GeoPoint(lat, lng);
        return geofences.findActiveByWorkSite(workSiteId, tenantId)
                .map(existing -> {
                    existing.redefine(center, radiusM);
                    return geofences.update(existing);
                })
                .orElseGet(() -> geofences.save(Geofence.createCircle(tenantId, workSiteId, center, radiusM)));
    }

    @Override
    @Transactional(readOnly = true)
    public Geofence getGeofence(UUID tenantId, UUID workSiteId) {
        return findGeofence(tenantId, workSiteId)
                .orElseThrow(() -> new ResourceNotFoundException("Geocerca del centro", workSiteId));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Geofence> findGeofence(UUID tenantId, UUID workSiteId) {
        return geofences.findActiveByWorkSite(workSiteId, tenantId);
    }

    @Override
    @Transactional
    public GeneratedQr generateQr(UUID tenantId, UUID workSiteId, Integer ttlMinutes, Instant expiresAtOverride) {
        return issue(tenantId, workSiteId, ttlMinutes, expiresAtOverride);
    }

    @Override
    @Transactional
    public GeneratedQr generateCompanyQr(UUID tenantId, Integer ttlMinutes, Instant expiresAtOverride) {
        return issue(tenantId, null, ttlMinutes, expiresAtOverride);
    }

    /** Emisión común: {@code workSiteId} nulo produce el QR de empresa. */
    private GeneratedQr issue(UUID tenantId, UUID workSiteId, Integer ttlMinutes, Instant expiresAtOverride) {
        Instant now = clock.instant();
        Instant expiresAt = resolveExpiry(now, ttlMinutes, expiresAtOverride);
        String nonce = newNonce();

        if (workSiteId == null) {
            qrTokens.deactivateActiveForCompany(tenantId);
        } else {
            qrTokens.deactivateActiveForSite(workSiteId, tenantId);
        }
        qrTokens.save(SiteQrToken.issue(tenantId, workSiteId, nonce, KEY_ID, now, expiresAt));

        String token = signer.sign(new QrPayload(tenantId, workSiteId, nonce, expiresAt));
        return new GeneratedQr(token, expiresAt);
    }

    private Instant resolveExpiry(Instant now, Integer ttlMinutes, Instant expiresAtOverride) {
        if (expiresAtOverride == null) {
            long ttlSeconds = ttlMinutes != null ? ttlMinutes * 60L : qrTtlSeconds;
            return now.plusSeconds(ttlSeconds);
        }
        if (!expiresAtOverride.isAfter(now)) {
            throw new DomainException("INVALID_QR_EXPIRY", "La fecha de expiración debe ser futura");
        }
        if (expiresAtOverride.isAfter(now.plus(Duration.ofDays(qrMaxFarExpiryDays)))) {
            throw new DomainException("INVALID_QR_EXPIRY",
                    "La fecha de expiración no puede superar " + qrMaxFarExpiryDays + " días");
        }
        return expiresAtOverride;
    }

    // Deliberadamente SIN @Transactional: lanza DomainException y se invoca desde la transacción
    // del registro de asistencia. Si fuera transaccional, el interceptor marcaría esa transacción
    // compartida como rollback-only antes de que QrValidationAdapter capturase la excepción, y el
    // commit acabaría en UnexpectedRollbackException.
    @Override
    public QrPayload verifyQr(String token) {
        QrPayload payload = signer.verify(token)
                .orElseThrow(() -> new DomainException("INVALID_QR", "QR inválido o alterado"));
        if (payload.expiresAt().isBefore(clock.instant())) {
            // Código propio: para quien registra asistencia, un QR caducado y uno falsificado
            // acaban en el mismo rechazo, pero solo el primero se resuelve renovando el cartel.
            throw new DomainException("QR_EXPIRED", "QR expirado");
        }
        // El QR de empresa se comprueba además contra el registro de emisiones: al no estar
        // respaldado por una geocerca, la firma y la vigencia no bastan y su rotación tiene que
        // dejar inservible al anterior. El QR de centro conserva su comportamiento histórico.
        if (payload.isCompanyWide() && !qrTokens.isActiveCompanyToken(payload.tenantId(), payload.nonce())) {
            throw new DomainException("INVALID_QR", "QR de empresa revocado o desconocido");
        }
        return payload;
    }

    private String newNonce() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
