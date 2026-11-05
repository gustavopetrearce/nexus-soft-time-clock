package com.condor.nexussoft.timeclock.identity.domain.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Credencial de un sistema externo (ADR-013). Pertenece a una empresa, no representa a ninguna
 * persona y solo conserva el hash del secreto.
 */
public class ApiClient {

    public enum Status { ACTIVE, REVOKED }

    private final UUID id;
    private final UUID tenantId;
    private final String clientId;
    private String secretHash;
    private final String name;
    private Status status;
    private final Instant lastUsedAt;
    private final UUID createdBy;
    private Instant revokedAt;
    private final Instant createdAt;

    public ApiClient(UUID id, UUID tenantId, String clientId, String secretHash, String name, Status status,
                     Instant lastUsedAt, UUID createdBy, Instant revokedAt, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.clientId = clientId;
        this.secretHash = secretHash;
        this.name = name;
        this.status = status;
        this.lastUsedAt = lastUsedAt;
        this.createdBy = createdBy;
        this.revokedAt = revokedAt;
        this.createdAt = createdAt;
    }

    public static ApiClient create(UUID tenantId, String clientId, String secretHash, String name,
                                   UUID createdBy, Instant now) {
        return new ApiClient(UUID.randomUUID(), tenantId, clientId, secretHash, name, Status.ACTIVE,
                null, createdBy, null, now);
    }

    public boolean isActive() {
        return status == Status.ACTIVE;
    }

    public void rotateSecret(String newSecretHash) {
        this.secretHash = newSecretHash;
    }

    public void revoke(Instant now) {
        this.status = Status.REVOKED;
        this.revokedAt = now;
    }

    public UUID id() { return id; }
    public UUID tenantId() { return tenantId; }
    public String clientId() { return clientId; }
    public String secretHash() { return secretHash; }
    public String name() { return name; }
    public Status status() { return status; }
    public Instant lastUsedAt() { return lastUsedAt; }
    public UUID createdBy() { return createdBy; }
    public Instant revokedAt() { return revokedAt; }
    public Instant createdAt() { return createdAt; }
}
