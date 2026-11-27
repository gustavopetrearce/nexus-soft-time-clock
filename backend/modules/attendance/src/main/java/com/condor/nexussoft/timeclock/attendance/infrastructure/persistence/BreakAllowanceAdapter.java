package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy.Allowance;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.BreakAllowancePort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Límites de descanso (V38) leídos con {@code JdbcTemplate}, como {@link ShiftZoneAdapter}: es una
 * lectura por marca dentro de la transacción del registro y ninguna consulta lanza si no encuentra
 * fila (un {@code orElseThrow} marcaría rollback-only la transacción compartida).
 *
 * <p>El día de la jornada es la fecha local de su ENTRADA, en la zona del horario del turno, del
 * centro o de la empresa. Un descanso cuenta para ese día si la ENTRADA de su propia jornada cae en
 * la misma fecha: así un nocturno pertenece al día en que empezó y la jornada de la mañana siguiente
 * no hereda sus descansos.</p>
 */
@Repository
public class BreakAllowanceAdapter implements BreakAllowancePort {

    private static final String OPEN_ENTRY = """
            SELECT server_time, shift_id, work_site_id
            FROM attendance_records
            WHERE tenant_id = ? AND user_id = ? AND status = 'ACCEPTED' AND event_type = 'ENTRADA'
              AND server_time >= ? AND server_time <= ?
            ORDER BY server_time DESC
            LIMIT 1
            """;

    /** Zona y restricción del turno; zona del centro/empresa si la ENTRADA no tenía turno. */
    private static final String SHIFT_RULES = """
            SELECT COALESCE(NULLIF(sc.timezone, ''), NULLIF(ws.timezone, ''), NULLIF(c.timezone, ''), 'UTC') AS tz,
                   COALESCE(s.breaks_restricted, false) AS restricted
            FROM companies c
            LEFT JOIN shifts s ON s.id = ? AND s.tenant_id = c.id
            LEFT JOIN schedules sc ON sc.id = s.schedule_id
            LEFT JOIN work_sites ws ON ws.id = ? AND ws.tenant_id = c.id
            WHERE c.id = ?
            """;

    private static final String ALLOWED = """
            SELECT break_type_id FROM shift_break_types WHERE shift_id = ? AND tenant_id = ?
            """;

    private static final String USED_ON_DAY = """
            SELECT DISTINCT b.break_type_id
            FROM attendance_records b
            CROSS JOIN LATERAL (
                SELECT e.server_time
                FROM attendance_records e
                WHERE e.tenant_id = b.tenant_id AND e.user_id = b.user_id
                  AND e.status = 'ACCEPTED' AND e.event_type = 'ENTRADA'
                  AND e.server_time <= b.server_time AND e.server_time >= ?
                ORDER BY e.server_time DESC
                LIMIT 1
            ) j
            WHERE b.tenant_id = ? AND b.user_id = ? AND b.status = 'ACCEPTED'
              AND b.event_type = 'INICIO_DESCANSO' AND b.break_type_id IS NOT NULL
              AND b.server_time >= ? AND b.server_time < ?
              AND j.server_time < ?
            """;

    private final JdbcTemplate jdbc;

    public BreakAllowanceAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Allowance find(UUID tenantId, UUID userId, Instant since, Instant at) {
        List<Entry> entries = jdbc.query(OPEN_ENTRY, (rs, i) -> new Entry(
                        rs.getTimestamp("server_time").toInstant(),
                        rs.getObject("shift_id", UUID.class),
                        rs.getObject("work_site_id", UUID.class)),
                tenantId, userId, Timestamp.from(since), Timestamp.from(at));
        if (entries.isEmpty()) {
            return Allowance.unrestricted();
        }
        Entry entry = entries.get(0);

        List<Rules> rules = jdbc.query(SHIFT_RULES,
                (rs, i) -> new Rules(rs.getString("tz"), rs.getBoolean("restricted")),
                entry.shiftId(), entry.workSiteId(), tenantId);
        ZoneId zone = rules.isEmpty() ? ZoneId.of("UTC") : toZone(rules.get(0).tz());
        boolean restricted = !rules.isEmpty() && rules.get(0).restricted() && entry.shiftId() != null;

        Set<UUID> allowed = restricted
                ? new HashSet<>(jdbc.queryForList(ALLOWED, UUID.class, entry.shiftId(), tenantId))
                : Set.of();

        LocalDate day = entry.serverTime().atZone(zone).toLocalDate();
        Instant dayStart = day.atStartOfDay(zone).toInstant();
        Instant dayEnd = day.plusDays(1).atStartOfDay(zone).toInstant();
        Set<UUID> used = new HashSet<>(jdbc.queryForList(USED_ON_DAY, UUID.class,
                Timestamp.from(dayStart), tenantId, userId, Timestamp.from(dayStart), Timestamp.from(at),
                Timestamp.from(dayEnd)));
        return new Allowance(restricted, allowed, used);
    }

    private static ZoneId toZone(String tz) {
        try {
            return tz == null || tz.isBlank() ? ZoneId.of("UTC") : ZoneId.of(tz);
        } catch (DateTimeException e) {
            return ZoneId.of("UTC");
        }
    }

    private record Entry(Instant serverTime, UUID shiftId, UUID workSiteId) {
    }

    private record Rules(String tz, boolean restricted) {
    }
}
