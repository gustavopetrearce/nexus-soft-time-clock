package com.condor.nexussoft.timeclock.platform.outbox;

import com.condor.nexussoft.timeclock.platform.audit.AuditContext;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Procesa UNA fila del outbox en su propia transacción (REQUIRES_NEW) para aislar fallos:
 * si un consumidor falla, solo esa fila queda pendiente para reintento; las demás avanzan.
 */
@Component
public class OutboxProcessor {

    private final OutboxEventJpaRepository repository;
    private final ApplicationEventPublisher publisher;
    private final ObjectMapper objectMapper;

    public OutboxProcessor(OutboxEventJpaRepository repository, ApplicationEventPublisher publisher,
                           ObjectMapper objectMapper) {
        this.repository = repository;
        this.publisher = publisher;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processOne(UUID id) throws Exception {
        OutboxEventJpaEntity row = repository.findById(id).orElse(null);
        if (row == null || !"PENDING".equals(row.getStatus())) {
            return;
        }
        Class<?> eventClass = Class.forName(row.getEventClass());
        Object event = objectMapper.readValue(row.getPayload(), eventClass);
        // El relay corre en un hilo del scheduler, sin petición detrás: sin restaurar el autor y
        // el tenant que se guardaron al escribir la fila, los consumidores (auditoría, incidencias)
        // trabajarían a ciegas y la bitácora quedaría sin actor (RN-60).
        AuditContext.set(row.actor());
        if (row.getTenantId() != null) {
            TenantContext.set(row.getTenantId());
        }
        try {
            publisher.publishEvent(event);        // consumidores síncronos dentro de esta tx aislada
            row.markPublished(Instant.now());
        } finally {
            AuditContext.clear();
            TenantContext.clear();
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(UUID id) {
        repository.findById(id).ifPresent(OutboxEventJpaEntity::markFailed);
    }
}
