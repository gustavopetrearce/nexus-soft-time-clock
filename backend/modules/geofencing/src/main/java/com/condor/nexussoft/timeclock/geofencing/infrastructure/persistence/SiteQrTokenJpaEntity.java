package com.condor.nexussoft.timeclock.geofencing.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "site_qr_tokens")
public class SiteQrTokenJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** Nulo en un QR de empresa: el cartel no pertenece a ningún centro (camino sin geocerca). */
    @Column(name = "work_site_id")
    private UUID workSiteId;

    @Column(nullable = false)
    private String nonce;

    @Column(name = "key_id", nullable = false)
    private String keyId;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    protected SiteQrTokenJpaEntity() {
    }

    public SiteQrTokenJpaEntity(UUID id, UUID tenantId, UUID workSiteId, String nonce, String keyId,
                                Instant issuedAt, Instant expiresAt, boolean active) {
        this.id = id;
        this.tenantId = tenantId;
        this.workSiteId = workSiteId;
        this.nonce = nonce;
        this.keyId = keyId;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.active = active;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getWorkSiteId() { return workSiteId; }
    public String getNonce() { return nonce; }
    public String getKeyId() { return keyId; }
    public Instant getIssuedAt() { return issuedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public boolean isActive() { return active; }
}
