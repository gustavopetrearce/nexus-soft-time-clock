package com.condor.nexussoft.timeclock.scheduling.domain.port.in;

import com.condor.nexussoft.timeclock.scheduling.domain.Schedule;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.shared.domain.Paged;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Administración de horarios, turnos y asignaciones (RF-08), acotada al tenant. */
public interface SchedulingUseCase {

    Schedule createSchedule(UUID tenantId, SchedulingCommands.CreateScheduleCommand command);

    Schedule updateSchedule(UUID tenantId, UUID scheduleId, SchedulingCommands.UpdateScheduleCommand command);

    Schedule getSchedule(UUID tenantId, UUID scheduleId);

    /**
     * Variante no excepcional de {@link #getSchedule}. Ver {@link #findShift} para el porqué.
     */
    Optional<Schedule> findSchedule(UUID tenantId, UUID scheduleId);

    Paged<Schedule> listSchedules(UUID tenantId, int page, int size, String search);

    Shift createShift(UUID tenantId, UUID scheduleId, SchedulingCommands.ShiftData data);

    Shift updateShift(UUID tenantId, UUID shiftId, SchedulingCommands.ShiftData data);

    Shift getShift(UUID tenantId, UUID shiftId);

    /**
     * Variante no excepcional de {@link #getShift}: para quien solo evalúa la ventana horaria, un turno
     * ausente es una condición normal. Lanzar desde un método {@code @Transactional} marca rollback-only
     * la transacción del llamador aunque este capture la excepción, y su commit falla después con
     * {@code UnexpectedRollbackException}.
     */
    Optional<Shift> findShift(UUID tenantId, UUID shiftId);

    List<Shift> listShifts(UUID tenantId, UUID scheduleId);

    ShiftAssignment assignShift(UUID tenantId, SchedulingCommands.AssignShiftCommand command);

    List<ShiftAssignment> listAssignments(UUID tenantId, UUID userId);
}
