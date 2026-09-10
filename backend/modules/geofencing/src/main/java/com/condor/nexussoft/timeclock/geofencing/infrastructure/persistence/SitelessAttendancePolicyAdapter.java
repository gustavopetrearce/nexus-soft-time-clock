package com.condor.nexussoft.timeclock.geofencing.infrastructure.persistence;

import com.condor.nexussoft.timeclock.geofencing.domain.port.out.SitelessAttendancePolicyPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Lee {@code company_settings.siteless_attendance_enabled} por consulta directa, siguiendo el mismo
 * precedente que {@code CompanyPolicyAdapter} y {@code DeviceBindingPolicyAdapter} en Attendance
 * (lectura provisional hasta que Tenancy exponga su servicio). Evita acoplar BC-05 con BC-02 por
 * una única bandera booleana.
 */
@Repository
public class SitelessAttendancePolicyAdapter implements SitelessAttendancePolicyPort {

    private final JdbcTemplate jdbc;

    public SitelessAttendancePolicyAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean isEnabled(UUID tenantId) {
        if (tenantId == null) {
            return false;
        }
        // Sin fila de configuración se cae del lado restrictivo: no se emite el QR de empresa.
        Boolean enabled = jdbc.query(
                "SELECT siteless_attendance_enabled FROM company_settings WHERE company_id = ? LIMIT 1",
                rs -> rs.next() && rs.getBoolean(1),
                tenantId);
        return Boolean.TRUE.equals(enabled);
    }
}
