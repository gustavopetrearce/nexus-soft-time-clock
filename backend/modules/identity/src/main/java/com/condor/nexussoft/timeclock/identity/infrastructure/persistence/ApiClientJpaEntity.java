package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "api_clients")
public class ApiClientJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "client_id", nullable = false)
    private String clientId;

    @Column(name = "secret_hash", nullable = false)
    private String secretHash;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String status;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ApiClientJpaEntity() {
    }

    public ApiClientJpaEntity(UUID id, UUID tenantId, String clientId, String secretHash, String name, String status,
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

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getClientId() { return clientId; }
    public String getSecretHash() { return secretHash; }
    public String getName() { return name; }
    public String getStatus() { return status; }
    public Instant getLastUsedAt() { return lastUsedAt; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getRevokedAt() { return revokedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
