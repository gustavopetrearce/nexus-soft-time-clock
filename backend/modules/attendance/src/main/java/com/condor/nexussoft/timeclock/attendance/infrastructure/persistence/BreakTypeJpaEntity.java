package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Categoría de descanso de una empresa (V30). */
@Entity
@Table(name = "attendance_break_types")
public class BreakTypeJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private boolean enabled;

    @Column(nullable = false)
    private boolean paid;

    @Column(name = "max_minutes")
    private Integer maxMinutes;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected BreakTypeJpaEntity() {
    }

    public BreakTypeJpaEntity(UUID id, UUID tenantId, String code, String label, boolean enabled,
                              boolean paid, Integer maxMinutes, int sortOrder) {
        this.id = id;
        this.tenantId = tenantId;
        this.code = code;
        this.label = label;
        this.enabled = enabled;
        this.paid = paid;
        this.maxMinutes = maxMinutes;
        this.sortOrder = sortOrder;
    }

    /** Copia los campos editables sobre una entidad ya gestionada (conserva {@code created_at}). */
    void apply(String code, String label, boolean enabled, boolean paid, Integer maxMinutes, int sortOrder) {
        this.code = code;
        this.label = label;
        this.enabled = enabled;
        this.paid = paid;
        this.maxMinutes = maxMinutes;
        this.sortOrder = sortOrder;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getCode() { return code; }
    public String getLabel() { return label; }
    public boolean isEnabled() { return enabled; }
    public boolean isPaid() { return paid; }
    public Integer getMaxMinutes() { return maxMinutes; }
    public int getSortOrder() { return sortOrder; }
}
