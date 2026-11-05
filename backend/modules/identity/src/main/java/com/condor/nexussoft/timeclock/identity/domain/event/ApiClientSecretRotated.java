package com.condor.nexussoft.timeclock.identity.domain.event;

import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;

import java.time.Instant;
import java.util.UUID;

/** Evento: se reemplazó el secreto de una credencial de sistema (ADR-013). Nunca lleva el secreto. */
public record ApiClientSecretRotated(UUID eventId, Instant occurredAt, UUID tenantId, UUID apiClientId,
                                     String clientId, String name) implements DomainEvent {

    public static ApiClientSecretRotated of(UUID tenantId, UUID apiClientId, String clientId, String name,
                                            Instant when) {
        return new ApiClientSecretRotated(UUID.randomUUID(), when, tenantId, apiClientId, clientId, name);
    }

    @Override
    public String eventType() {
        return "ApiClientSecretRotated";
    }
}
