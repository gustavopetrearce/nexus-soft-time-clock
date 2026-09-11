package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.EvidenceStoragePort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.WorkSitePolicyPort;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.time.Instant;
import java.util.UUID;

/** DTOs de evidencia fotográfica (RF-18, HU-13). */
public final class EvidenceDtos {

    private EvidenceDtos() {
    }

    /**
     * Petición de ticket de subida. El {@code contentType} y el {@code sizeBytes} se declaran para
     * rechazar de entrada lo inadmisible; el tamaño y el tipo reales se verifican después contra
     * el objeto almacenado, porque una declaración del cliente no es prueba de nada.
     */
    public record EvidenceUploadRequest(
            UUID workSiteId,
            @NotBlank String contentType,
            @Positive long sizeBytes,
            String sha256) {
    }

    /** Ticket de subida. La clave la decide el servidor; el cliente solo la devuelve al registrar. */
    public record EvidenceUploadResponse(String bucket, String objectKey, String uploadUrl,
                                         Instant expiresAt, long maxBytes) {

        public static EvidenceUploadResponse from(EvidenceStoragePort.UploadTicket t) {
            return new EvidenceUploadResponse(t.bucket(), t.objectKey(), t.uploadUrl(), t.expiresAt(), t.maxBytes());
        }
    }

    /** URL de lectura de vida corta para mostrar la evidencia en el portal. */
    public record EvidenceViewResponse(String url) {
    }

    /**
     * Política de registro efectiva del centro (ya resuelta la herencia empresa → centro).
     * La consume la app para saber si debe exigir foto <b>antes</b> de enviar, en vez de
     * descubrirlo por el rechazo del servidor.
     */
    public record SitePolicyResponse(boolean requirePhoto, boolean requireBiometric, Integer gpsAccuracyMaxM) {

        public static SitePolicyResponse from(WorkSitePolicyPort.SitePolicy p) {
            return new SitePolicyResponse(p.requirePhoto(), p.requireBiometric(), p.gpsAccuracyMaxM());
        }
    }
}
