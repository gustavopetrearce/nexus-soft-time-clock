package com.condor.nexussoft.timeclock.audit.infrastructure.persistence;

import com.condor.nexussoft.timeclock.audit.domain.AuditLogEntry;
import com.condor.nexussoft.timeclock.audit.domain.port.out.AuditLogRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Repository
public class AuditPersistenceAdapter implements AuditLogRepositoryPort {

    private final AuditLogJpaRepository jpa;

    @PersistenceContext
    private EntityManager entityManager;

    public AuditPersistenceAdapter(AuditLogJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    @Transactional
    public void append(AuditLogEntry e) {
        // persist() garantiza INSERT (la tabla es append-only; UPDATE/DELETE bloqueados por trigger).
        entityManager.persist(new AuditLogJpaEntity(e.id(), e.tenantId(), e.createdAt(),
                e.actorUserId(), e.actorEmail(), e.action(), e.resourceType(), e.resourceId(),
                e.ip(), e.userAgent(), e.deviceInfo(), e.oldValuesJson(), e.newValuesJson()));
    }

    @Override
    public Paged<AuditLogEntry> findByTenant(UUID tenantId, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<AuditLogJpaEntity> result = jpa.findByTenantId(tenantId, pageable);
        return new Paged<>(result.map(this::toDomain).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements());
    }

    private AuditLogEntry toDomain(AuditLogJpaEntity e) {
        return new AuditLogEntry(e.getId(), e.getTenantId(), e.getActorUserId(), e.getActorEmail(),
                e.getAction(), e.getResourceType(), e.getResourceId(), e.getIp(), e.getUserAgent(),
                e.getDeviceInfo(), e.getOldValues(), e.getNewValues(), e.getCreatedAt());
    }
}
