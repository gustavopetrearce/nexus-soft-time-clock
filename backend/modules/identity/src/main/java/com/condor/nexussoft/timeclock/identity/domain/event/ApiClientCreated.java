package com.condor.nexussoft.timeclock.identity.domain.event;

import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;

import java.time.Instant;
import java.util.UUID;

/** Evento: se creó una credencial de sistema (ADR-013). Nunca lleva el secreto: acaba en la bitácora. */
public record ApiClientCreated(UUID eventId, Instant occurredAt, UUID tenantId, UUID apiClientId,
                               String clientId, String name) implements DomainEvent {

    public static ApiClientCreated of(UUID tenantId, UUID apiClientId, String clientId, String name, Instant when) {
        return new ApiClientCreated(UUID.randomUUID(), when, tenantId, apiClientId, clientId, name);
    }

    @Override
    public String eventType() {
        return "ApiClientCreated";
    }
}
