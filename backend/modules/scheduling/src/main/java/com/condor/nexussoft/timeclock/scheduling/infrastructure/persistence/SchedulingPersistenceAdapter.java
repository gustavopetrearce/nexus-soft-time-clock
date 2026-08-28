package com.condor.nexussoft.timeclock.scheduling.infrastructure.persistence;

import com.condor.nexussoft.timeclock.scheduling.domain.Schedule;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ScheduleRepositoryPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ShiftAssignmentRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Adaptador de horarios y asignaciones. Los turnos viven en {@link ShiftPersistenceAdapter}. */
@Repository
public class SchedulingPersistenceAdapter implements ScheduleRepositoryPort, ShiftAssignmentRepositoryPort {

    private final ScheduleJpaRepository scheduleRepo;
    private final ShiftAssignmentJpaRepository assignmentRepo;

    public SchedulingPersistenceAdapter(ScheduleJpaRepository scheduleRepo,
                                        ShiftAssignmentJpaRepository assignmentRepo) {
        this.scheduleRepo = scheduleRepo;
        this.assignmentRepo = assignmentRepo;
    }

    // --- Schedule ---
    @Override
    public Schedule save(Schedule s) {
        scheduleRepo.save(new ScheduleJpaEntity(s.id(), s.tenantId(), s.code(), s.name(), s.timezone(), s.status().name()));
        return s;
    }

    @Override
    public Schedule update(Schedule s) {
        ScheduleJpaEntity e = scheduleRepo.findByIdAndTenantId(s.id(), s.tenantId()).orElseThrow();
        e.setName(s.name());
        e.setTimezone(s.timezone());
        e.setStatus(s.status().name());
        scheduleRepo.save(e);
        return s;
    }

    @Override
    public Optional<Schedule> findByIdAndTenant(UUID id, UUID tenantId) {
        return scheduleRepo.findByIdAndTenantId(id, tenantId).map(this::toSchedule);
    }

    @Override
    public boolean existsByTenantAndCode(UUID tenantId, String code) {
        return scheduleRepo.existsByTenantIdAndCodeIgnoreCase(tenantId, code);
    }

    @Override
    public Paged<Schedule> findAllByTenant(UUID tenantId, int page, int size, String search) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("name").ascending());
        Page<ScheduleJpaEntity> result = (search == null || search.isBlank())
                ? scheduleRepo.findByTenantId(tenantId, pageable)
                : scheduleRepo.findByTenantIdAndNameContainingIgnoreCase(tenantId, search, pageable);
        return new Paged<>(result.map(this::toSchedule).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements());
    }

    // --- ShiftAssignment ---
    @Override
    public ShiftAssignment save(ShiftAssignment a) {
        assignmentRepo.save(new ShiftAssignmentJpaEntity(a.id(), a.tenantId(), a.userId(), a.shiftId(),
                a.workSiteId(), a.validFrom(), a.validTo()));
        return a;
    }

    @Override
    public List<ShiftAssignment> findByUserAndTenant(UUID userId, UUID tenantId) {
        return assignmentRepo.findByUserIdAndTenantIdOrderByValidFromDescIdAsc(userId, tenantId).stream().map(this::toAssignment).toList();
    }

    private Schedule toSchedule(ScheduleJpaEntity e) {
        return new Schedule(e.getId(), e.getTenantId(), e.getCode(), e.getName(), e.getTimezone(),
                Schedule.Status.valueOf(e.getStatus()));
    }

    private ShiftAssignment toAssignment(ShiftAssignmentJpaEntity e) {
        return new ShiftAssignment(e.getId(), e.getTenantId(), e.getUserId(), e.getShiftId(),
                e.getWorkSiteId(), e.getValidFrom(), e.getValidTo());
    }
}
