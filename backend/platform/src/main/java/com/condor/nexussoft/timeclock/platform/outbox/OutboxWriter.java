package com.condor.nexussoft.timeclock.platform.outbox;

import com.condor.nexussoft.timeclock.platform.audit.AuditActor;
import com.condor.nexussoft.timeclock.platform.audit.AuditContext;
import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Escribe el evento en el outbox DENTRO de la transacción de negocio (misma tx que el
 * cambio de estado del agregado). Así se evita el "dual write": el evento se publica
 * de forma consistente por el {@link OutboxRelay} tras el commit (ADR-005).
 */
@Component
public class OutboxWriter {

    @PersistenceContext
    private EntityManager entityManager;

    private final ObjectMapper objectMapper;

    public OutboxWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(DomainEvent event) {
        entityManager.persist(new OutboxEventJpaEntity(
                UUID.randomUUID(),
                event.tenantId(),
                "DomainEvent",
                event.eventId().toString(),
                event.eventType(),
                event.getClass().getName(),
                toJson(event),
                event.occurredAt(),
                // Todavía estamos en la petición: es el único momento en que se sabe quién
                // provocó el evento. Después solo queda lo que se haya guardado aquí.
                AuditContext.get().orElse(AuditActor.SYSTEM)));
    }

    private String toJson(DomainEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo serializar el evento para el outbox", e);
        }
    }
}
