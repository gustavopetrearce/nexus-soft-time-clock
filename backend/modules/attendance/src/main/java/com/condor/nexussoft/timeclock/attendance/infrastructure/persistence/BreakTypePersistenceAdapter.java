package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.BreakType;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.BreakTypePort;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class BreakTypePersistenceAdapter implements BreakTypePort {

    private final BreakTypeJpaRepository jpa;
    private final NamedParameterJdbcTemplate jdbc;

    public BreakTypePersistenceAdapter(BreakTypeJpaRepository jpa, NamedParameterJdbcTemplate jdbc) {
        this.jpa = jpa;
        this.jdbc = jdbc;
    }

    @Override
    public List<BreakType> findByTenant(UUID tenantId) {
        return jpa.findByTenantIdOrderBySortOrderAscLabelAsc(tenantId).stream().map(this::toDomain).toList();
    }

    @Override
    public Optional<BreakType> findById(UUID tenantId, UUID id) {
        return jpa.findByTenantIdAndId(tenantId, id).map(this::toDomain);
    }

    @Override
    public boolean existsCode(UUID tenantId, String code, UUID excludingId) {
        return jpa.findByTenantIdAndCode(tenantId, code)
                .filter(e -> excludingId == null || !e.getId().equals(excludingId))
                .isPresent();
    }

    @Override
    public BreakType save(BreakType b) {
        BreakTypeJpaEntity entity = jpa.findByTenantIdAndId(b.tenantId(), b.id())
                .map(e -> {
                    e.apply(b.code(), b.label(), b.enabled(), b.paid(), b.maxMinutes(), b.sortOrder());
                    return e;
                })
                .orElseGet(() -> new BreakTypeJpaEntity(b.id(), b.tenantId(), b.code(), b.label(),
                        b.enabled(), b.paid(), b.maxMinutes(), b.sortOrder()));
        return toDomain(jpa.save(entity));
    }

    @Override
    public boolean isInUse(UUID tenantId, UUID id) {
        Boolean used = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM attendance_records WHERE tenant_id = :tenant AND break_type_id = :id)",
                new MapSqlParameterSource().addValue("tenant", tenantId).addValue("id", id), Boolean.class);
        return Boolean.TRUE.equals(used);
    }

    @Override
    public void delete(UUID tenantId, UUID id) {
        jpa.findByTenantIdAndId(tenantId, id).ifPresent(jpa::delete);
    }

    private BreakType toDomain(BreakTypeJpaEntity e) {
        return new BreakType(e.getId(), e.getTenantId(), e.getCode(), e.getLabel(), e.isEnabled(),
                e.isPaid(), e.getMaxMinutes(), e.getSortOrder());
    }
}
