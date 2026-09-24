package com.condor.nexussoft.timeclock.audit.application;

import com.condor.nexussoft.timeclock.audit.domain.AuditLogEntry;
import com.condor.nexussoft.timeclock.audit.domain.port.out.AuditLogRepositoryPort;
import com.condor.nexussoft.timeclock.platform.audit.AuditActor;
import com.condor.nexussoft.timeclock.platform.audit.AuditContext;
import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/** Convierte un evento de dominio en una entrada de auditoría y la persiste (append-only). */
@Service
public class AuditRecorder {

    private final AuditLogRepositoryPort auditLog;
    private final ObjectMapper objectMapper;

    public AuditRecorder(AuditLogRepositoryPort auditLog, ObjectMapper objectMapper) {
        this.auditLog = auditLog;
        this.objectMapper = objectMapper;
    }

    public void record(DomainEvent event) {
        // El autor sale del contexto, no del SecurityContext: los eventos llegan aquí desde el
        // relay del outbox, en un hilo del scheduler donde la petición original ya no existe.
        // El relay repone el actor que se guardó con la fila (V26).
        AuditActor actor = AuditContext.get().orElse(AuditActor.SYSTEM);

        auditLog.append(new AuditLogEntry(
                UUID.randomUUID(),
                event.tenantId(),
                actor.userId(),
                actor.email(),
                event.eventType(),
                event.getClass().getSimpleName(),
                event.eventId().toString(),
                actor.ip(),
                actor.userAgent(),
                actor.device(),
                null,                 // un evento de dominio narra lo ocurrido, no un estado previo
                toJson(event),
                event.occurredAt()));
    }

    /** Alta directa, para las escrituras que no pasan por un evento de dominio (RN-43). */
    public void record(UUID tenantId, String action, String resourceType, String resourceId,
                       String oldValuesJson, String newValuesJson) {
        AuditActor actor = AuditContext.get().orElse(AuditActor.SYSTEM);

        auditLog.append(new AuditLogEntry(
                UUID.randomUUID(),
                tenantId,
                actor.userId(),
                actor.email(),
                action,
                resourceType,
                resourceId,
                actor.ip(),
                actor.userAgent(),
                actor.device(),
                oldValuesJson,
                newValuesJson,
                Instant.now()));
    }

    private String toJson(DomainEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            return "{}";
        }
    }
}
