package com.condor.nexussoft.timeclock.scheduling.infrastructure.persistence;

import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ShiftRepositoryPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Turnos. Las categorías de descanso admitidas (V38, {@code shift_break_types}) se guardan con
 * {@code JdbcTemplate}: la tabla referencia {@code attendance_break_types} (módulo attendance) y así
 * no hay dependencia de código entre módulos. Solo se enlazan categorías del mismo tenant.
 */
@Repository
public class ShiftPersistenceAdapter implements ShiftRepositoryPort {

    private static final String LINK =
            "INSERT INTO shift_break_types (shift_id, break_type_id, tenant_id) "
            + "SELECT ?, bt.id, bt.tenant_id FROM attendance_break_types bt WHERE bt.id = ? AND bt.tenant_id = ? "
            + "ON CONFLICT DO NOTHING";

    private final ShiftJpaRepository shiftRepo;
    private final JdbcTemplate jdbc;

    public ShiftPersistenceAdapter(ShiftJpaRepository shiftRepo, JdbcTemplate jdbc) {
        this.shiftRepo = shiftRepo;
        this.jdbc = jdbc;
    }

    @Override
    public Shift save(Shift s) {
        ShiftJpaEntity e = toEntity(s);
        e.setBreaksRestricted(s.breaksRestricted());
        shiftRepo.saveAndFlush(e);
        writeBreakTypes(s);
        return s;
    }

    @Override
    public Shift update(Shift s) {
        ShiftJpaEntity e = shiftRepo.findByIdAndTenantId(s.id(), s.tenantId()).orElseThrow();
        e.apply(s.name(), s.startTime(), s.endTime(), s.crossesMidnight(), s.breakMinutes(),
                s.lateToleranceMin(), s.earlyToleranceMin(), s.windowBeforeMin(), s.windowAfterMin());
        e.setBreaksRestricted(s.breaksRestricted());
        shiftRepo.saveAndFlush(e);
        writeBreakTypes(s);
        return s;
    }

    private void writeBreakTypes(Shift s) {
        jdbc.update("DELETE FROM shift_break_types WHERE shift_id = ? AND tenant_id = ?", s.id(), s.tenantId());
        for (UUID breakTypeId : s.allowedBreakTypeIds()) {
            jdbc.update(LINK, s.id(), breakTypeId, s.tenantId());
        }
    }

    private Set<UUID> readBreakTypes(UUID shiftId, UUID tenantId) {
        return new HashSet<>(jdbc.queryForList(
                "SELECT break_type_id FROM shift_break_types WHERE shift_id = ? AND tenant_id = ?",
                UUID.class, shiftId, tenantId));
    }

    @Override
    public Optional<Shift> findByIdAndTenant(UUID id, UUID tenantId) {
        return shiftRepo.findByIdAndTenantId(id, tenantId).map(this::toShift);
    }

    @Override
    public List<Shift> findByScheduleAndTenant(UUID scheduleId, UUID tenantId) {
        return shiftRepo.findByScheduleIdAndTenantId(scheduleId, tenantId).stream().map(this::toShift).toList();
    }

    private ShiftJpaEntity toEntity(Shift s) {
        return new ShiftJpaEntity(s.id(), s.tenantId(), s.scheduleId(), s.name(), s.startTime(), s.endTime(),
                s.crossesMidnight(), s.breakMinutes(), s.lateToleranceMin(), s.earlyToleranceMin(),
                s.windowBeforeMin(), s.windowAfterMin());
    }

    private Shift toShift(ShiftJpaEntity e) {
        Shift s = new Shift(e.getId(), e.getTenantId(), e.getScheduleId(), e.getName(), e.getStartTime(),
                e.getEndTime(), e.isCrossesMidnight(), e.getBreakMinutes(), e.getLateToleranceMin(),
                e.getEarlyToleranceMin(), e.getWindowBeforeMin(), e.getWindowAfterMin());
        if (e.isBreaksRestricted()) {
            s.setBreakRules(true, readBreakTypes(e.getId(), e.getTenantId()));
        }
        return s;
    }
}
