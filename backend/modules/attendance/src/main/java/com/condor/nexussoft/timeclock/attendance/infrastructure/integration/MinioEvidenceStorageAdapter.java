package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.EvidenceStoragePort;
import com.condor.nexussoft.timeclock.platform.storage.ObjectStorage;
import com.condor.nexussoft.timeclock.platform.storage.StorageProperties;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;

/**
 * Implementa la evidencia fotográfica sobre el object storage de plataforma (MinIO, ADR-008).
 *
 * <p>Esquema de clave, decidido siempre por el servidor:
 * <pre>t/{tenant}/s/{site}/d/{yyyy}/{MM}/{dd}/u/{user}/{uuid}.jpg</pre>
 * En una marcación sin centro, {@code {site}} es el centinela {@code _none}.
 * El tenant y el usuario en el prefijo permiten rechazar de plano una clave ajena; la fecha
 * abarata el barrido de huérfanos y evita reciclar la foto de otro día.
 */
@Component
public class MinioEvidenceStorageAdapter implements EvidenceStoragePort {

    private static final Logger log = LoggerFactory.getLogger(MinioEvidenceStorageAdapter.class);
    private static final DateTimeFormatter DATE_PATH = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneOffset.UTC);

    /** Segmento de centro para las marcaciones sin centro de trabajo (V25). */
    private static final String SITELESS_SEGMENT = "_none";

    private final ObjectStorage storage;
    private final StorageProperties props;

    public MinioEvidenceStorageAdapter(ObjectStorage storage, StorageProperties props) {
        this.storage = storage;
        this.props = props;
    }

    @Override
    public String bucket() {
        return storage.bucket();
    }

    @Override
    public long maxBytes() {
        return props.maxBytes();
    }

    @Override
    public boolean isContentTypeAllowed(String contentType) {
        return props.isContentTypeAllowed(contentType);
    }

    @Override
    public UploadTicket presignUpload(UUID tenantId, UUID userId, UUID workSiteId, Instant now) {
        if (!storage.isAvailable()) {
            // Mejor un código de negocio que el cliente pueda mostrar que un 500 opaco.
            throw new DomainException("EVIDENCE_STORAGE_UNAVAILABLE",
                    "El almacenamiento de evidencias no está disponible.");
        }
        String key = prefix(tenantId, userId, workSiteId, now) + UUID.randomUUID() + ".jpg";
        var url = storage.presignPut(key, Duration.ofSeconds(props.putTtlSeconds()));
        return new UploadTicket(storage.bucket(), key, url.url(), url.expiresAt(), props.maxBytes());
    }

    @Override
    public String presignDownload(String objectKey) {
        return storage.presignGet(objectKey, Duration.ofSeconds(props.getTtlSeconds())).url();
    }

    @Override
    public Outcome validate(UUID tenantId, UUID userId, UUID workSiteId, String objectKey, Instant now) {
        if (objectKey == null || objectKey.isBlank()) {
            return Outcome.MISSING;
        }
        // 1) El prefijo se comprueba antes de tocar la red: una clave ajena no merece una llamada.
        //    Se ignora el segmento de fecha para no rechazar una subida hecha justo antes de medianoche.
        if (!objectKey.startsWith(sitePrefix(tenantId, workSiteId)) || !objectKey.contains(userSegment(userId))) {
            return Outcome.FOREIGN_PREFIX;
        }

        Optional<ObjectStorage.ObjectMetadata> found;
        try {
            found = storage.stat(objectKey);
        } catch (RuntimeException e) {
            // Falla cerrado: sin poder verificar, la evidencia no cuenta (y con foto obligatoria
            // el registro se rechaza). Bloquear el fichaje es preferible a aceptar una foto fantasma.
            log.warn("No se pudo verificar la evidencia {}: {}", objectKey, e.getMessage());
            return Outcome.UNAVAILABLE;
        }
        if (found.isEmpty()) {
            return Outcome.MISSING;
        }

        ObjectStorage.ObjectMetadata meta = found.get();
        if (meta.sizeBytes() > props.maxBytes()) {
            return Outcome.TOO_LARGE;
        }
        if (!props.isContentTypeAllowed(meta.contentType())) {
            return Outcome.BAD_CONTENT_TYPE;
        }
        if (meta.lastModified().isBefore(now.minusSeconds(props.uploadFreshnessSeconds()))) {
            return Outcome.STALE;
        }
        return Outcome.VALID;
    }

    private String prefix(UUID tenantId, UUID userId, UUID workSiteId, Instant now) {
        return sitePrefix(tenantId, workSiteId) + "d/" + DATE_PATH.format(now) + "/" + userSegment(userId);
    }

    /**
     * Segmento de centro del prefijo. Una marcación sin centro (QR de empresa) usa el centinela
     * {@code _none} en lugar de interpolar el literal {@code null}. Lo comparten la firma de subida
     * y la verificación posterior, así que ambas siguen coincidiendo.
     */
    private String sitePrefix(UUID tenantId, UUID workSiteId) {
        return "t/" + tenantId + "/s/" + (workSiteId == null ? SITELESS_SEGMENT : workSiteId) + "/";
    }

    private String userSegment(UUID userId) {
        return "u/" + userId + "/";
    }
}
