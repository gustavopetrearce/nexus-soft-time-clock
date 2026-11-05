package com.condor.nexussoft.timeclock.identity.domain.event;

import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;

import java.time.Instant;
import java.util.UUID;

/** Evento: se revocó una credencial de sistema (ADR-013). */
public record ApiClientRevoked(UUID eventId, Instant occurredAt, UUID tenantId, UUID apiClientId,
                               String clientId, String name) implements DomainEvent {

    public static ApiClientRevoked of(UUID tenantId, UUID apiClientId, String clientId, String name, Instant when) {
        return new ApiClientRevoked(UUID.randomUUID(), when, tenantId, apiClientId, clientId, name);
    }

    @Override
    public String eventType() {
        return "ApiClientRevoked";
    }
}
