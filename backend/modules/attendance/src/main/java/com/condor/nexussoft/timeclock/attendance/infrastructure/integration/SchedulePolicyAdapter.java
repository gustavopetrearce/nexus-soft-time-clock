package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.ScheduleWindowValidator;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.SchedulePolicyPort;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Puente hacia Scheduling: busca el turno asignado vigente del colaborador en el centro y evalúa
 * la ventana de registro (RN-15). Sin turno asignado vigente no impone restricción horaria.
 */
@Component
public class SchedulePolicyAdapter implements SchedulePolicyPort {

    private static final ZoneId FALLBACK_ZONE = ZoneId.of("UTC");

    private final SchedulingUseCase scheduling;

    public SchedulePolicyAdapter(SchedulingUseCase scheduling) {
        this.scheduling = scheduling;
    }

    @Override
    public ScheduleDecision check(UUID tenantId, UUID userId, UUID workSiteId,
                                  AttendanceEventType eventType, Instant at) {
        List<ShiftAssignment> forSite = scheduling.listAssignments(tenantId, userId).stream()
                .filter(a -> workSiteId.equals(a.workSiteId()))
                .toList();

        boolean anyEffectiveToday = false;
        Candidate best = null;
        for (ShiftAssignment a : forSite) {
            Shift shift = safeShift(tenantId, a.shiftId());
            if (shift == null) {
                continue;
            }
            ZoneId zone = zoneForShift(tenantId, shift);
            LocalDateTime nowLocal = LocalDateTime.ofInstant(at, zone);
            if (!isEffectiveOn(a, nowLocal.toLocalDate())) {
                continue;   // asignación no vigente hoy en la zona del turno
            }
            anyEffectiveToday = true;
            Optional<ScheduleWindowValidator.Occurrence> matched = ScheduleWindowValidator.matchedOccurrence(
                    shift.startTime(), shift.endTime(), shift.crossesMidnight(),
                    shift.windowBeforeMin(), shift.windowAfterMin(), nowLocal);
            if (matched.isEmpty()) {
                continue;
            }
            ScheduleWindowValidator.Occurrence occurrence = matched.get();
            // RN-16: tardanza sobre inicio + tolerancia de la ocurrencia que casó la ventana.
            LocalDateTime lateThreshold = occurrence.start().plusMinutes(shift.lateToleranceMin());
            long minutesLate = Duration.between(lateThreshold, nowLocal).toMinutes();

            Candidate candidate = new Candidate(shift.id(),
                    occurrence.referenceDistanceMinutes(eventType, nowLocal),
                    occurrence.startedBy(nowLocal),
                    (int) Math.max(0, minutesLate));
            if (best == null || candidate.isBetterThan(best)) {
                best = candidate;
            }
        }

        if (best != null) {
            return ScheduleDecision.withinWindow(best.minutesLate(), best.shiftId());
        }
        // Sin turno vigente hoy no se restringe; con turno vigente pero fuera de ventana → rechazo.
        return anyEffectiveToday ? ScheduleDecision.outOfWindow() : ScheduleDecision.noSchedule();
    }

    /**
     * Un turno que reclama la marca. Con varios turnos el mismo día las ventanas se solapan
     * —{@code window_after} de uno pisa el {@code window_before} del siguiente— y hay que decidir a
     * cuál pertenece: no vale quedarse con el primero que aparezca, porque la consulta de
     * asignaciones no impone orden y el resultado sería distinto entre llamadas.
     */
    private record Candidate(UUID shiftId, long distanceMinutes, boolean started, int minutesLate) {

        /** Gana el borde más cercano; a igual distancia, el turno ya empezado; y su id, para cerrar. */
        boolean isBetterThan(Candidate other) {
            if (distanceMinutes != other.distanceMinutes) {
                return distanceMinutes < other.distanceMinutes;
            }
            if (started != other.started) {
                return started;
            }
            return shiftId.compareTo(other.shiftId) < 0;
        }
    }

    private boolean isEffectiveOn(ShiftAssignment a, LocalDate date) {
        boolean startedOk = !date.isBefore(a.validFrom());
        boolean notEnded = a.validTo() == null || !date.isAfter(a.validTo());
        return startedOk && notEnded;
    }

    private ZoneId zoneForShift(UUID tenantId, Shift shift) {
        try {
            String tz = scheduling.getSchedule(tenantId, shift.scheduleId()).timezone();
            return tz == null || tz.isBlank() ? FALLBACK_ZONE : ZoneId.of(tz);
        } catch (RuntimeException e) {
            return FALLBACK_ZONE;
        }
    }

    private Shift safeShift(UUID tenantId, UUID shiftId) {
        try {
            return scheduling.getShift(tenantId, shiftId);
        } catch (ResourceNotFoundException e) {
            return null;
        }
    }
}
