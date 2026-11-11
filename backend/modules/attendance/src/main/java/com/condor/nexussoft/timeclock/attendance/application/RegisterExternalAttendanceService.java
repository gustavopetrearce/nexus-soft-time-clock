package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceStatus;
import com.condor.nexussoft.timeclock.attendance.domain.EventTypeCatalog;
import com.condor.nexussoft.timeclock.attendance.domain.RejectionReason;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRejected;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterExternalAttendanceUseCase;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.*;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Marcación de un sistema externo en nombre de un colaborador (ADR-013). Es un camino aparte de
 * {@link RegisterAttendanceService} porque casi todo lo que aquel valida (QR, GPS, antifraude,
 * dispositivo, foto, biometría) prueba que la persona está presente, y eso aquí ya lo garantizó el
 * sistema emisor. Se conservan las reglas de la jornada: tipo de evento, horario y secuencia.
 *
 * <p>La hora oficial es la del evento, no la de llegada: es la excepción a RN-11 que recoge el ADR,
 * acotada en el pasado y en el futuro. La de llegada queda en {@code created_at} y en el evento de
 * dominio, igual que en un lote offline.</p>
 */
@Service
public class RegisterExternalAttendanceService implements RegisterExternalAttendanceUseCase {

    private static final String SOURCE = "EXTERNAL";
    private static final String EXTERNAL_FLAG = "EXTERNAL_SOURCE";

    /** Margen para relojes desfasados: un minuto de más en el emisor no debe perder la marca. */
    private static final Duration FUTURE_TOLERANCE = Duration.ofMinutes(5);

    private final ExternalIntegrationPort integration;
    private final AttendanceRepositoryPort attendance;
    private final IdempotencyStorePort idempotency;
    private final WorkSitePolicyPort sitePolicy;
    private final SchedulePolicyPort schedulePolicy;
    private final EventTypeConfigPort eventTypeConfig;
    private final CompanyPolicyPort companyPolicy;
    private final AttendanceEventPublisherPort events;
    private final Clock clock;
    private final long maxAgeHours;

    public RegisterExternalAttendanceService(ExternalIntegrationPort integration, AttendanceRepositoryPort attendance,
                                             IdempotencyStorePort idempotency, WorkSitePolicyPort sitePolicy,
                                             SchedulePolicyPort schedulePolicy, EventTypeConfigPort eventTypeConfig,
                                             CompanyPolicyPort companyPolicy, AttendanceEventPublisherPort events,
                                             Clock clock,
                                             @Value("${attendance.offline.max-age-hours:72}") long maxAgeHours) {
        this.integration = integration;
        this.attendance = attendance;
        this.idempotency = idempotency;
        this.sitePolicy = sitePolicy;
        this.schedulePolicy = schedulePolicy;
        this.eventTypeConfig = eventTypeConfig;
        this.companyPolicy = companyPolicy;
        this.events = events;
        this.clock = clock;
        this.maxAgeHours = maxAgeHours;
    }

    @Override
    @Transactional
    public AttendanceResult register(UUID tenantId, UUID apiClientId, ExternalAttendanceCommand cmd) {
        // Antes que la idempotencia: una credencial revocada no debe obtener ni resultados previos.
        if (!integration.isClientActive(tenantId, apiClientId)) {
            throw new AuthorizationException("API_CLIENT_REVOKED", "La credencial ya no está activa.");
        }
        var previous = idempotency.find(tenantId, cmd.operationUuid());
        if (previous.isPresent()) {
            return previous.get();
        }

        // Lo que sigue impide crear el registro: sin colaborador, centro u hora válidos no hay marca
        // que guardar. Es un error del emisor (422), corregible y reintentable con el mismo UUID.
        UUID userId = eligibleCollaborator(tenantId, cmd.employeeCode());
        if (!sitePolicy.isActive(tenantId, cmd.workSiteId())) {
            throw new DomainException("WORK_SITE_NOT_FOUND", "El centro de trabajo no existe o no está activo.");
        }
        Instant now = clock.instant();
        requireInRange(cmd.eventTime(), now);

        AttendanceEventType eventType = AttendanceEventType.valueOf(cmd.eventType());
        UUID recordId = UUID.randomUUID();
        List<String> flags = new ArrayList<>(List.of(EXTERNAL_FLAG));
        RejectionReason reason = null;

        // La tolerancia a futuro evita perder la marca de un reloj adelantado, pero la hora oficial no
        // puede pasar de la de llegada: una marca por QR posterior se validaría contra esta y quedaría
        // fechada antes que ella, desordenando la jornada.
        Instant eventTime = cmd.eventTime();
        if (eventTime.isAfter(now)) {
            eventTime = now;
            flags.add("EVENT_TIME_CLAMPED");
        }

        if (EventTypeCatalog.isConfigurable(eventType)
                && !EventTypeCatalog.isEnabled(eventType, eventTypeConfig.findByTenant(tenantId))) {
            reason = RejectionReason.EVENT_TYPE_DISABLED;
        }

        // Mismo criterio que el registro normal: la ventana solo rechaza la ENTRADA (RN-15), y sin
        // turno vigente se acepta con NO_SCHEDULE.
        SchedulePolicyPort.ScheduleDecision schedule =
                schedulePolicy.check(tenantId, userId, cmd.workSiteId(), eventType, eventTime);
        boolean outOfWindow = schedule.outcome() == SchedulePolicyPort.Outcome.OUT_OF_WINDOW;
        boolean noSchedule = schedule.outcome() == SchedulePolicyPort.Outcome.NO_SCHEDULE;
        if (outOfWindow) {
            flags.add("OUT_OF_SCHEDULE");
        }
        if (noSchedule) {
            flags.add("NO_SCHEDULE");
        }
        if (reason == null && outOfWindow && eventType == AttendanceEventType.ENTRADA) {
            reason = RejectionReason.OUT_OF_SCHEDULE;
        }

        if (reason == null) {
            reason = validateSequence(tenantId, userId, cmd.workSiteId(), eventType, eventTime);
        }

        int lateMinutes = 0;
        if (reason == null && eventType == AttendanceEventType.ENTRADA
                && schedule.outcome() == SchedulePolicyPort.Outcome.WITHIN_WINDOW && schedule.minutesLate() > 0) {
            lateMinutes = schedule.minutesLate();
            flags.add("LATE");
        }

        AttendanceStatus status = reason == null ? AttendanceStatus.ACCEPTED : AttendanceStatus.REJECTED;
        AttendanceRecord record = new AttendanceRecord(recordId, tenantId, eventTime, userId, cmd.workSiteId(),
                schedule.shiftId(), eventType, status, reason, null, null, null, null, null, null,
                cmd.operationUuid(), SOURCE, false, null,
                validationsJson(flags, reason, lateMinutes, apiClientId));
        attendance.save(record);

        AttendanceResult result = new AttendanceResult(recordId, status.name(),
                reason == null ? null : reason.name(), eventTime, null, flags, lateMinutes);
        idempotency.save(tenantId, cmd.operationUuid(), result);

        if (record.isAccepted()) {
            events.publish(AttendanceRegistered.of(tenantId, recordId, userId, cmd.workSiteId(),
                    eventType.name(), lateMinutes, outOfWindow, noSchedule, now));
        } else {
            events.publish(AttendanceRejected.of(tenantId, recordId, userId, reason.name(), now));
        }
        return result;
    }

    private UUID eligibleCollaborator(UUID tenantId, String employeeCode) {
        ExternalIntegrationPort.Collaborator collaborator = integration.findCollaborator(tenantId, employeeCode)
                .orElseThrow(() -> new DomainException("EMPLOYEE_NOT_FOUND",
                        "No hay ningún colaborador con ese código de empleado."));
        switch (collaborator.eligibility()) {
            case INACTIVE -> throw new DomainException("EMPLOYEE_INACTIVE", "El colaborador no está activo.");
            case NOT_ENABLED -> throw new DomainException("EMPLOYEE_NOT_ENABLED",
                    "El usuario no está habilitado para registrar asistencia.");
            case ELIGIBLE -> { }
        }
        return collaborator.userId();
    }

    private void requireInRange(Instant eventTime, Instant now) {
        boolean tooOld = eventTime.isBefore(now.minus(maxAgeHours, ChronoUnit.HOURS));
        boolean inFuture = eventTime.isAfter(now.plus(FUTURE_TOLERANCE));
        if (tooOld || inFuture) {
            throw new DomainException("EVENT_TIME_OUT_OF_RANGE",
                    "La hora del evento no puede tener más de " + maxAgeHours + " horas ni estar en el futuro.");
        }
    }

    /**
     * La jornada se evalúa en el momento del evento, no en el de llegada. Una marca anterior a otra
     * ya aceptada se rechaza en vez de intercalarse, porque podría invalidar lo que ya se dio por
     * bueno: de ahí que el emisor deba enviar en orden cronológico por colaborador.
     */
    private RejectionReason validateSequence(UUID tenantId, UUID userId, UUID workSiteId,
                                             AttendanceEventType eventType, Instant eventTime) {
        if (attendance.existsAcceptedEventSince(tenantId, userId, eventTime)) {
            return RejectionReason.INVALID_SEQUENCE;
        }
        Instant since = eventTime.minus(companyPolicy.find(tenantId).openShiftMaxHours(), ChronoUnit.HOURS);
        return AttendanceSequenceValidator
                .validate(attendance.findLastAcceptedEventBefore(tenantId, userId, since, eventTime),
                        eventType, workSiteId)
                .orElse(null);
    }

    private String validationsJson(List<String> flags, RejectionReason reason, int lateMinutes, UUID apiClientId) {
        String flagsArray = flags.stream().map(f -> "\"" + f + "\"").collect(Collectors.joining(",", "[", "]"));
        String reasonJson = reason == null ? "null" : "\"" + reason.name() + "\"";
        return "{\"flags\":" + flagsArray + ",\"rejectionReason\":" + reasonJson
                + ",\"lateMinutes\":" + lateMinutes + ",\"apiClientId\":\"" + apiClientId + "\"}";
    }
}
