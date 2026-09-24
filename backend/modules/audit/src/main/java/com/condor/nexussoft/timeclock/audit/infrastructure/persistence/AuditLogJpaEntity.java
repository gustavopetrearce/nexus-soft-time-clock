package com.condor.nexussoft.timeclock.audit.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/** Fila de la bitácora. Append-only: la tabla bloquea UPDATE/DELETE por trigger (RN-61). */
@Entity
@Table(name = "audit_logs")
public class AuditLogJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "actor_email")
    private String actorEmail;

    @Column(nullable = false)
    private String action;

    @Column(name = "resource_type")
    private String resourceType;

    @Column(name = "resource_id")
    private String resourceId;

    // La columna es inet (V8), que es el tipo correcto para consultar por red, pero el driver
    // manda un varchar: el cast explícito evita el "column ip is of type inet" en cada INSERT.
    @Column(name = "ip")
    @ColumnTransformer(write = "?::inet")
    private String ip;

    @Column(name = "user_agent")
    private String userAgent;

    @Column(name = "device_info")
    private String deviceInfo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "old_values")
    private String oldValues;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "new_values")
    private String newValues;

    protected AuditLogJpaEntity() {
    }

    public AuditLogJpaEntity(UUID id, UUID tenantId, Instant createdAt, UUID actorUserId,
                             String actorEmail, String action, String resourceType, String resourceId,
                             String ip, String userAgent, String deviceInfo,
                             String oldValues, String newValues) {
        this.id = id;
        this.tenantId = tenantId;
        this.createdAt = createdAt;
        this.actorUserId = actorUserId;
        this.actorEmail = actorEmail;
        this.action = action;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.ip = ip;
        this.userAgent = userAgent;
        this.deviceInfo = deviceInfo;
        this.oldValues = oldValues;
        this.newValues = newValues;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getActorUserId() { return actorUserId; }
    public String getActorEmail() { return actorEmail; }
    public String getAction() { return action; }
    public String getResourceType() { return resourceType; }
    public String getResourceId() { return resourceId; }
    public String getIp() { return ip; }
    public String getUserAgent() { return userAgent; }
    public String getDeviceInfo() { return deviceInfo; }
    public String getOldValues() { return oldValues; }
    public String getNewValues() { return newValues; }
}
