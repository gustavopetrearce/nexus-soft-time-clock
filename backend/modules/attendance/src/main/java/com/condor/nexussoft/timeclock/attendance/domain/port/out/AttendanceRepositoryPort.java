package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator.LastEvent;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceSummary;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttendanceRepositoryPort {

    void save(AttendanceRecord record);

    /**
     * Historial del usuario (más recientes primero) acotado por rango de fechas opcional.
     * {@code from} inclusivo, {@code toExclusive} exclusivo; nulos = sin cota por ese extremo.
     */
    List<AttendanceSummary> findRecentByUser(UUID tenantId, UUID userId, Instant from, Instant toExclusive, int limit);

    /**
     * Último evento <b>aceptado</b> del usuario, que define el estado de su jornada (RN-12).
     *
     * @param since cota inferior sobre la hora de servidor: los eventos anteriores ya no cuentan como
     *              jornada abierta ({@code company_settings.open_shift_max_hours}, V23). Sin ella, una
     *              ENTRADA sin su SALIDA bloquearía al colaborador indefinidamente.
     */
    Optional<LastEvent> findLastAcceptedEvent(UUID tenantId, UUID userId, Instant since);
}
