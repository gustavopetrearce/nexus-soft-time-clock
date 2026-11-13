package com.condor.nexussoft.timeclock.incidents.domain.port.out;

import com.condor.nexussoft.timeclock.incidents.domain.Incident;
import com.condor.nexussoft.timeclock.shared.domain.Paged;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IncidentRepositoryPort {

    Incident save(Incident incident);

    Incident update(Incident incident);

    Optional<Incident> findByIdAndTenant(UUID id, UUID tenantId);

    /** {@code status} nulo = todas. */
    Paged<Incident> findByTenant(UUID tenantId, String status, int page, int size);

    List<Incident> findOpenByRelatedAttendance(UUID tenantId, UUID attendanceId);
}
