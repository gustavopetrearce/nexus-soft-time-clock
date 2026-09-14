package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.ScheduleWindowValidator;
import com.condor.nexussoft.timeclock.attendance.domain.ScheduleWindowValidator.Occurrence;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.SchedulePolicyPort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.ShiftZonePort;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Puente hacia Scheduling: decide a qué turno pertenece la marca y evalúa su ventana de registro
 * (RN-15). Sin turno asignado vigente no impone restricción horaria.
 *
 * <p>Las dos decisiones van <b>en ese orden y por separado</b>. Antes la ventana filtraba la
 * candidatura, y un turno cuya ventana aún no había abierto no competía: quien llegaba pronto a su
 * turno veía la marca atribuida al turno anterior —todavía dentro de su {@code window_after}— y
 * medida contra un inicio de horas antes, con su incidencia de RETARDO. Ahora compiten todas las
 * apariciones de todos los turnos vigentes, y la ventana se comprueba sobre la que gana.</p>
 */
@Component
public class SchedulePolicyAdapter implements SchedulePolicyPort {

    private final SchedulingUseCase scheduling;
    private final ShiftZonePort zones;

    public SchedulePolicyAdapter(SchedulingUseCase scheduling, ShiftZonePort zones) {
        this.scheduling = scheduling;
        this.zones = zones;
    }

    @Override
    public ScheduleDecision check(UUID tenantId, UUID userId, UUID workSiteId,
                                  AttendanceEventType eventType, Instant at) {
        // Sin centro (QR de empresa) no hay contra qué filtrar: se evalúan todas las asignaciones
        // vigentes del colaborador, de modo que el camino sin centro conserva la ventana de turno
        // y la detección de retardo (RN-15, RN-16) en lugar de quedarse sin control horario.
        List<ShiftAssignment> forSite = scheduling.listAssignments(tenantId, userId).stream()
                .filter(a -> workSiteId == null || workSiteId.equals(a.workSiteId()))
                .toList();

        Map<ZoneKey, ZoneId> zoneCache = new HashMap<>();
        Candidate best = null;
        for (ShiftAssignment a : forSite) {
            Shift shift = safeShift(tenantId, a.shiftId());
            if (shift == null) {
                continue;   // turno borrado con la asignación viva → sin restricción horaria
            }
            ZoneId zone = zoneCache.computeIfAbsent(new ZoneKey(shift.scheduleId(), a.workSiteId()),
                    k -> zones.resolve(tenantId, k.scheduleId(), k.workSiteId()));
            LocalDateTime nowLocal = LocalDateTime.ofInstant(at, zone);

            for (Occurrence occurrence : ScheduleWindowValidator.candidateOccurrences(
                    shift.startTime(), shift.endTime(), shift.crossesMidnight(), nowLocal)) {
                // La vigencia se mide contra el día de la jornada, no contra el día del reloj: un
                // turno nocturno fichado de madrugada pertenece al día en que arrancó.
                if (!isEffectiveOn(a, occurrence.businessDate())) {
                    continue;
                }
                Candidate candidate = candidateFor(shift, occurrence, eventType, nowLocal);
                if (best == null || candidate.isBetterThan(best)) {
                    best = candidate;
                }
            }
        }

        if (best == null) {
            return ScheduleDecision.noSchedule();   // sin turno vigente no se restringe
        }
        return best.withinWindow()
                ? ScheduleDecision.withinWindow(best.minutesLate(), best.shiftId())
                : ScheduleDecision.outOfWindow(best.shiftId());
    }

    private Candidate candidateFor(Shift shift, Occurrence occurrence, AttendanceEventType eventType,
                                   LocalDateTime nowLocal) {
        // RN-16: tardanza sobre inicio + tolerancia de la aparición concreta, no de la hora suelta.
        LocalDateTime lateThreshold = occurrence.start().plusMinutes(shift.lateToleranceMin());
        long minutesLate = Duration.between(lateThreshold, nowLocal).toMinutes();

        return new Candidate(shift.id(),
                occurrence.referenceDistanceMinutes(eventType, nowLocal),
                occurrence.startedBy(nowLocal),
                (int) Math.max(0, minutesLate),
                occurrence.withinWindow(shift.windowBeforeMin(), shift.windowAfterMin(), nowLocal));
    }

    /**
     * La zona depende del horario del turno y del centro de la asignación (herencia horario → centro
     * → empresa), así que la caché de una misma evaluación va por esa pareja.
     */
    private record ZoneKey(UUID scheduleId, UUID workSiteId) {
    }

    /**
     * Una aparición de un turno que reclama la marca. Con varios turnos el mismo día hay que decidir
     * a cuál pertenece: no vale quedarse con la primera que aparezca, porque la consulta de
     * asignaciones no impone orden y el resultado sería distinto entre llamadas.
     */
    private record Candidate(UUID shiftId, long distanceMinutes, boolean started, int minutesLate,
                             boolean withinWindow) {

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

    /**
     * Turno ausente (borrado con la asignación viva) → sin restricción horaria, sin excepción. Se
     * consulta con la variante que devuelve {@code Optional}: la que lanza marcaría rollback-only la
     * transacción del registro de asistencia —aun capturando la excepción aquí— y el commit fallaría
     * con {@code UnexpectedRollbackException}.
     */
    private Shift safeShift(UUID tenantId, UUID shiftId) {
        return scheduling.findShift(tenantId, shiftId).orElse(null);
    }
}
