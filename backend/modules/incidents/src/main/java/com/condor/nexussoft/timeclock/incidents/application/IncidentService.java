package com.condor.nexussoft.timeclock.incidents.application;

import com.condor.nexussoft.timeclock.incidents.domain.Incident;
import com.condor.nexussoft.timeclock.incidents.domain.port.in.IncidentManagementUseCase;
import com.condor.nexussoft.timeclock.incidents.domain.port.out.IncidentRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

@Service
public class IncidentService implements IncidentManagementUseCase {

    private final IncidentRepositoryPort incidents;
    private final Clock clock;

    public IncidentService(IncidentRepositoryPort incidents, Clock clock) {
        this.incidents = incidents;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Paged<Incident> list(UUID tenantId, String status, int page, int size) {
        return incidents.findByTenant(tenantId, status, page, size);
    }

    @Override
    @Transactional
    public Incident resolve(UUID tenantId, UUID incidentId, String status, String note, UUID resolverId) {
        Incident incident = incidents.findByIdAndTenant(incidentId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Incidencia", incidentId));
        incident.resolve(Incident.Status.valueOf(status), note, resolverId, clock.instant());
        return incidents.update(incident);
    }

    @Override
    @Transactional
    public Incident openForRejectedAttendance(UUID tenantId, UUID userId, UUID attendanceId, String reason) {
        return incidents.save(Incident.openForRejectedAttendance(tenantId, userId, attendanceId, reason));
    }

    @Override
    @Transactional
    public Incident openForLateArrival(UUID tenantId, UUID userId, UUID attendanceId, int minutesLate) {
        return incidents.save(Incident.openForLateArrival(tenantId, userId, attendanceId, minutesLate));
    }

    @Override
    @Transactional
    public Incident openForOutOfWindow(UUID tenantId, UUID userId, UUID attendanceId, String eventKind) {
        return incidents.save(Incident.openForOutOfWindow(tenantId, userId, attendanceId, eventKind));
    }
}
