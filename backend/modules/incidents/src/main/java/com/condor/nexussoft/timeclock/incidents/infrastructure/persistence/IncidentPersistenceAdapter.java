package com.condor.nexussoft.timeclock.incidents.infrastructure.persistence;

import com.condor.nexussoft.timeclock.incidents.domain.Incident;
import com.condor.nexussoft.timeclock.incidents.domain.port.out.IncidentRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class IncidentPersistenceAdapter implements IncidentRepositoryPort {

    private final IncidentJpaRepository jpa;

    public IncidentPersistenceAdapter(IncidentJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Incident save(Incident i) {
        jpa.save(toEntity(i));
        return i;
    }

    @Override
    public Incident update(Incident i) {
        IncidentJpaEntity e = jpa.findByIdAndTenantId(i.id(), i.tenantId()).orElseThrow();
        e.applyResolution(i.status().name(), i.resolutionNote(), i.resolvedBy(), i.resolvedAt());
        jpa.save(e);
        return i;
    }

    @Override
    public Optional<Incident> findByIdAndTenant(UUID id, UUID tenantId) {
        return jpa.findByIdAndTenantId(id, tenantId).map(this::toDomain);
    }

    @Override
    public Paged<Incident> findByTenant(UUID tenantId, String status, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("incidentDate").descending());
        Page<IncidentJpaEntity> result = (status == null || status.isBlank())
                ? jpa.findByTenantId(tenantId, pageable)
                : jpa.findByTenantIdAndStatus(tenantId, status, pageable);
        return new Paged<>(result.map(this::toDomain).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Override
    public List<Incident> findOpenByRelatedAttendance(UUID tenantId, UUID attendanceId) {
        return jpa.findByTenantIdAndRelatedAttendanceIdAndStatus(tenantId, attendanceId,
                        Incident.Status.OPEN.name()).stream()
                .map(this::toDomain)
                .toList();
    }

    private IncidentJpaEntity toEntity(Incident i) {
        return new IncidentJpaEntity(i.id(), i.tenantId(), i.userId(), i.type().name(), i.status().name(),
                i.priority(), i.incidentDate(), i.relatedAttendanceId(), i.description(),
                i.resolutionNote(), i.resolvedBy(), i.resolvedAt(), i.createdAt());
    }

    private Incident toDomain(IncidentJpaEntity e) {
        return new Incident(e.getId(), e.getTenantId(), e.getUserId(),
                Incident.Type.valueOf(e.getType()), Incident.Status.valueOf(e.getStatus()), e.getPriority(),
                e.getIncidentDate(), e.getRelatedAttendanceId(), e.getDescription(),
                e.getResolutionNote(), e.getResolvedBy(), e.getResolvedAt(), e.getCreatedAt());
    }
}
