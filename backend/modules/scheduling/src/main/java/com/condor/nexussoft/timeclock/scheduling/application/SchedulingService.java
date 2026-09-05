package com.condor.nexussoft.timeclock.scheduling.application;

import com.condor.nexussoft.timeclock.scheduling.domain.Schedule;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ScheduleRepositoryPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ShiftAssignmentRepositoryPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ShiftRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class SchedulingService implements SchedulingUseCase {

    private final ScheduleRepositoryPort schedules;
    private final ShiftRepositoryPort shifts;
    private final ShiftAssignmentRepositoryPort assignments;

    public SchedulingService(ScheduleRepositoryPort schedules, ShiftRepositoryPort shifts,
                             ShiftAssignmentRepositoryPort assignments) {
        this.schedules = schedules;
        this.shifts = shifts;
        this.assignments = assignments;
    }

    @Override
    @Transactional
    public Schedule createSchedule(UUID tenantId, SchedulingCommands.CreateScheduleCommand c) {
        if (schedules.existsByTenantAndCode(tenantId, c.code())) {
            throw new DomainException("DUPLICATE_CODE", "Ya existe un horario con el código " + c.code());
        }
        return schedules.save(Schedule.create(tenantId, c.code(), c.name(), c.timezone()));
    }

    @Override
    @Transactional
    public Schedule updateSchedule(UUID tenantId, UUID id, SchedulingCommands.UpdateScheduleCommand c) {
        Schedule schedule = requireSchedule(tenantId, id);
        Schedule.Status status = c.status() == null ? null : Schedule.Status.valueOf(c.status());
        schedule.update(c.name(), c.timezone(), status);
        return schedules.update(schedule);
    }

    @Override
    @Transactional(readOnly = true)
    public Schedule getSchedule(UUID tenantId, UUID id) {
        return requireSchedule(tenantId, id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Schedule> findSchedule(UUID tenantId, UUID id) {
        return schedules.findByIdAndTenant(id, tenantId);
    }

    @Override
    @Transactional(readOnly = true)
    public Paged<Schedule> listSchedules(UUID tenantId, int page, int size, String search) {
        return schedules.findAllByTenant(tenantId, page, size, search);
    }

    @Override
    @Transactional
    public Shift createShift(UUID tenantId, UUID scheduleId, SchedulingCommands.ShiftData d) {
        requireSchedule(tenantId, scheduleId);   // valida pertenencia del horario al tenant
        Shift shift = Shift.create(tenantId, scheduleId, d.name(), d.startTime(), d.endTime(),
                d.crossesMidnight(), d.breakMinutes(), d.lateToleranceMin(), d.earlyToleranceMin(),
                d.windowBeforeMin(), d.windowAfterMin());
        return shifts.save(shift);
    }

    @Override
    @Transactional
    public Shift updateShift(UUID tenantId, UUID shiftId, SchedulingCommands.ShiftData d) {
        Shift shift = shifts.findByIdAndTenant(shiftId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Turno", shiftId));
        shift.update(d.name(), d.startTime(), d.endTime(), d.crossesMidnight(), d.breakMinutes(),
                d.lateToleranceMin(), d.earlyToleranceMin(), d.windowBeforeMin(), d.windowAfterMin());
        return shifts.update(shift);
    }

    @Override
    @Transactional(readOnly = true)
    public Shift getShift(UUID tenantId, UUID shiftId) {
        return shifts.findByIdAndTenant(shiftId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Turno", shiftId));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Shift> findShift(UUID tenantId, UUID shiftId) {
        return shifts.findByIdAndTenant(shiftId, tenantId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Shift> listShifts(UUID tenantId, UUID scheduleId) {
        requireSchedule(tenantId, scheduleId);
        return shifts.findByScheduleAndTenant(scheduleId, tenantId);
    }

    @Override
    @Transactional
    public ShiftAssignment assignShift(UUID tenantId, SchedulingCommands.AssignShiftCommand c) {
        shifts.findByIdAndTenant(c.shiftId(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Turno", c.shiftId()));
        return assignments.save(ShiftAssignment.create(tenantId, c.userId(), c.shiftId(),
                c.workSiteId(), c.validFrom(), c.validTo()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ShiftAssignment> listAssignments(UUID tenantId, UUID userId) {
        return assignments.findByUserAndTenant(userId, tenantId);
    }

    private Schedule requireSchedule(UUID tenantId, UUID id) {
        return schedules.findByIdAndTenant(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Horario", id));
    }
}
