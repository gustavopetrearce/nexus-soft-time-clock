package com.condor.nexussoft.timeclock.scheduling.infrastructure.persistence;

import com.condor.nexussoft.timeclock.scheduling.domain.port.out.TenantDirectoryPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Consulta directa a {@code users} y {@code work_sites} (lectura provisional entre módulos, mismo
 * precedente que los adaptadores de política de Attendance y Geofencing).
 */
@Repository
public class TenantDirectoryAdapter implements TenantDirectoryPort {

    private final JdbcTemplate jdbc;

    public TenantDirectoryAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean isTenantUser(UUID tenantId, UUID userId) {
        return exists("SELECT count(*) FROM users WHERE id = ? AND tenant_id = ?", tenantId, userId);
    }

    @Override
    public boolean isTenantWorkSite(UUID tenantId, UUID workSiteId) {
        return exists("SELECT count(*) FROM work_sites WHERE id = ? AND tenant_id = ?", tenantId, workSiteId);
    }

    private boolean exists(String sql, UUID tenantId, UUID id) {
        if (tenantId == null || id == null) {
            return false;
        }
        Integer n = jdbc.queryForObject(sql, Integer.class, id, tenantId);
        return n != null && n > 0;
    }
}
