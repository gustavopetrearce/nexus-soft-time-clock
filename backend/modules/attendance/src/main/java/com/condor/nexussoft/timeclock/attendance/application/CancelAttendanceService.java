package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecordRef;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceStatus;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceCancelled;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.CancelAttendanceUseCase;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.AttendanceEventPublisherPort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.AttendanceRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Cancela una marca ya registrada. La fila no se borra: pasa a {@code CANCELLED} con quién, cuándo y
 * la causa (texto libre, solo referencia). Como todos los cálculos de asistencia filtran
 * {@code ACCEPTED}, la marca deja de contar sin más. La cancelación es definitiva.
 *
 * <p>La entidad de asistencia está excluida del auditado automático de cambios, así que la traza
 * queda por el evento {@link AttendanceCancelled} (outbox → Audit).
 */
@Service
public class CancelAttendanceService implements CancelAttendanceUseCase {

    private final AttendanceRepositoryPort records;
    private final AttendanceEventPublisherPort events;
    private final Clock clock;

    public CancelAttendanceService(AttendanceRepositoryPort records, AttendanceEventPublisherPort events,
                                   Clock clock) {
        this.records = records;
        this.events = events;
        this.clock = clock;
    }

    @Override
    @Transactional
    public CancelledAttendance cancel(UUID tenantId, UUID recordId, Instant serverTime, String reason,
                                      UUID actorId) {
        String cause = reason == null ? "" : reason.strip();
        if (cause.isEmpty()) {
            throw new DomainException("CANCEL_REASON_REQUIRED", "La causa de la cancelación es obligatoria");
        }
        if (cause.length() > MAX_REASON_LENGTH) {
            throw new DomainException("CANCEL_REASON_TOO_LONG",
                    "La causa no puede superar " + MAX_REASON_LENGTH + " caracteres");
        }

        AttendanceRecordRef record = records.findRef(tenantId, recordId, serverTime)
                .orElseThrow(() -> new ResourceNotFoundException("Marcación", recordId));
        if (!record.status().isCancellable()) {
            throw notCancellable(record.status());
        }

        Instant now = clock.instant();
        // El UPDATE vuelve a exigir un estado cancelable: dos cancelaciones simultáneas no pisan la causa.
        if (!records.markCancelled(tenantId, record.id(), record.serverTime(), cause, actorId, now)) {
            throw notCancellable(AttendanceStatus.CANCELLED);
        }

        events.publish(AttendanceCancelled.of(tenantId, record.id(), record.serverTime(), record.userId(),
                record.eventType().name(), actorId, cause, now));
        return new CancelledAttendance(record.id(), record.serverTime(), AttendanceStatus.CANCELLED.name(),
                cause, actorId, now);
    }

    private static ConflictException notCancellable(AttendanceStatus status) {
        return status == AttendanceStatus.CANCELLED
                ? new ConflictException("ATTENDANCE_ALREADY_CANCELLED", "La marcación ya está cancelada")
                : new ConflictException("ATTENDANCE_NOT_CANCELLABLE",
                        "Solo se pueden cancelar marcaciones aceptadas o en revisión");
    }
}
