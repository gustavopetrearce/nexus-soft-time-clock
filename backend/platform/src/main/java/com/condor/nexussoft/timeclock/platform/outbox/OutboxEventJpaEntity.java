package com.condor.nexussoft.timeclock.platform.outbox;

import com.condor.nexussoft.timeclock.platform.audit.AuditActor;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/** Fila del outbox transaccional (ADR-005). */
@Entity
@Table(name = "outbox_events")
public class OutboxEventJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "aggregate_type", nullable = false)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private String aggregateId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "event_class")
    private String eventClass;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String payload;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private String status;

    // Autor de la acción que originó el evento (V26). Se captura aquí porque el relay publica
    // después del commit, en un hilo sin petición ni SecurityContext del que deducirlo (RN-60).
    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "actor_email")
    private String actorEmail;

    @Column(name = "actor_ip")
    private String actorIp;

    @Column(name = "actor_user_agent")
    private String actorUserAgent;

    @Column(name = "actor_device")
    private String actorDevice;

    protected OutboxEventJpaEntity() {
    }

    public OutboxEventJpaEntity(UUID id, UUID tenantId, String aggregateType, String aggregateId,
                                String eventType, String eventClass, String payload, Instant occurredAt,
                                AuditActor actor) {
        this.id = id;
        this.tenantId = tenantId;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.eventClass = eventClass;
        this.payload = payload;
        this.occurredAt = occurredAt;
        this.attempts = 0;
        this.status = "PENDING";
        this.actorUserId = actor.userId();
        this.actorEmail = actor.email();
        this.actorIp = actor.ip();
        this.actorUserAgent = actor.userAgent();
        this.actorDevice = actor.device();
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getEventClass() { return eventClass; }
    public String getPayload() { return payload; }
    public String getStatus() { return status; }
    public int getAttempts() { return attempts; }

    /** Autor original, para devolverlo al contexto mientras se publica el evento. */
    public AuditActor actor() {
        return new AuditActor(actorUserId, actorEmail, actorIp, actorUserAgent, actorDevice);
    }

    public void markPublished(Instant when) {
        this.status = "PUBLISHED";
        this.publishedAt = when;
    }

    public void markFailed() {
        this.attempts++;
        if (this.attempts >= 10) {
            this.status = "FAILED";
        }
    }
}
