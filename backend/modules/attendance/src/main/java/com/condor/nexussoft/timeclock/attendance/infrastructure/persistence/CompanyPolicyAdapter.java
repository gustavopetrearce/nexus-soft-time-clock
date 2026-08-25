package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.CompanyPolicyPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Lee la política de registro del tenant desde {@code company_settings} vía consulta directa,
 * siguiendo el mismo precedente que {@code DeviceBindingPolicyAdapter} (lectura provisional
 * hasta que Tenancy exponga su servicio).
 */
@Repository
public class CompanyPolicyAdapter implements CompanyPolicyPort {

    private final JdbcTemplate jdbc;

    public CompanyPolicyAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public CompanyPolicy find(UUID tenantId) {
        if (tenantId == null) {
            return CompanyPolicy.defaults();
        }
        return jdbc.query(
                "SELECT default_gps_accuracy_max_m, require_photo, require_biometric, open_shift_max_hours "
                        + "FROM company_settings WHERE company_id = ? LIMIT 1",
                rs -> {
                    if (!rs.next()) {
                        return CompanyPolicy.defaults();
                    }
                    int accuracy = rs.getInt("default_gps_accuracy_max_m");
                    boolean accuracyNull = rs.wasNull();
                    int openShiftHours = rs.getInt("open_shift_max_hours");
                    if (rs.wasNull() || openShiftHours <= 0) {
                        openShiftHours = DEFAULT_OPEN_SHIFT_MAX_HOURS;
                    }
                    return new CompanyPolicy(
                            accuracyNull ? null : accuracy,
                            rs.getBoolean("require_photo"),
                            rs.getBoolean("require_biometric"),
                            openShiftHours);
                },
                tenantId);
    }
}
