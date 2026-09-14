package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.ShiftZonePort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.UUID;

/**
 * Resuelve la zona del turno bajando por la cadena horario → centro → empresa → UTC en una sola
 * consulta, vía {@code JdbcTemplate} (mismo precedente que {@code CompanyPolicyAdapter}).
 *
 * <p>Se lee así, y no con los casos de uso de Scheduling/Organization, por dos razones: es una
 * lectura por marca dentro de la transacción del registro de asistencia, y una consulta que no
 * encuentra fila <b>no lanza</b>. Pedirlo con un {@code orElseThrow} marcaría rollback-only la
 * transacción compartida —aun capturando la excepción— y el commit fallaría con
 * {@code UnexpectedRollbackException}.</p>
 */
@Repository
public class ShiftZoneAdapter implements ShiftZonePort {

    private static final ZoneId FALLBACK = ZoneId.of("UTC");

    /**
     * {@code NULLIF(…, '')} porque el formulario web manda cadena vacía tan fácilmente como NULL, y
     * una zona en blanco significa «heredar», no «UTC».
     */
    private static final String SQL = """
            SELECT COALESCE(NULLIF(sc.timezone, ''), NULLIF(ws.timezone, ''), NULLIF(c.timezone, ''), 'UTC')
            FROM schedules sc
            JOIN companies c ON c.id = sc.tenant_id
            LEFT JOIN work_sites ws ON ws.id = ? AND ws.tenant_id = sc.tenant_id
            WHERE sc.id = ? AND sc.tenant_id = ?
            """;

    private final JdbcTemplate jdbc;

    public ShiftZoneAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ZoneId resolve(UUID tenantId, UUID scheduleId, UUID workSiteId) {
        if (tenantId == null || scheduleId == null) {
            return FALLBACK;
        }
        String tz = jdbc.query(SQL, rs -> rs.next() ? rs.getString(1) : null,
                workSiteId, scheduleId, tenantId);
        return toZone(tz);
    }

    /** Una zona mal escrita es un dato corrupto, no un fallo de la marcación: se degrada a UTC. */
    private ZoneId toZone(String tz) {
        if (tz == null || tz.isBlank()) {
            return FALLBACK;
        }
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException e) {
            return FALLBACK;
        }
    }
}
