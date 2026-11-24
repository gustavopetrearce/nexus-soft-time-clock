package com.condor.nexussoft.timeclock.geofencing.infrastructure.persistence;

import com.condor.nexussoft.timeclock.geofencing.domain.port.out.WorkSiteDirectoryPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/** Consulta directa a {@code work_sites} (mismo precedente que {@link SitelessAttendancePolicyAdapter}). */
@Repository
public class WorkSiteDirectoryAdapter implements WorkSiteDirectoryPort {

    private final JdbcTemplate jdbc;

    public WorkSiteDirectoryAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean belongsToTenant(UUID tenantId, UUID workSiteId) {
        if (tenantId == null || workSiteId == null) {
            return false;
        }
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM work_sites WHERE id = ? AND tenant_id = ?", Integer.class, workSiteId, tenantId);
        return n != null && n > 0;
    }
}
