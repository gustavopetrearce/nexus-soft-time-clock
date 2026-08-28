package com.condor.nexussoft.timeclock.reporting.application;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Desglose de horas por centro de trabajo (RF-11). Responde a dónde se trabajaron realmente las horas
 * cuando la jornada pasa por más de una sede: {@code CAMBIO_SITIO} la traslada, y hasta ahora el
 * reporte atribuía el periodo entero al último centro marcado.
 *
 * <p>Reparte sobre los mismos tramos que agrega el resumen por colaborador
 * ({@link AttendanceSummaryService}), definidos una sola vez en {@link JourneySegmentsSql}, así que
 * la suma de los centros de un colaborador cuadra con sus horas del resumen.</p>
 *
 * <p>Las extras se imputan al centro donde se produjeron: son los últimos minutos trabajados de la
 * jornada, y se reparten recorriendo los tramos desde el final.</p>
 */
@Service
public class SiteHoursService {

    private static final int MAX_ROWS = 5000;

    private static final String SQL = ("""
            WITH """ + JourneySegmentsSql.CTES + """
            ,
            emp AS (
                SELECT id, employee_code, first_name, last_name
                FROM users
                WHERE tenant_id = :tenant AND is_platform_admin = false
            )
            SELECT e.employee_code,
                   e.first_name,
                   e.last_name,
                   ws.name                AS work_center,
                   sum(sf.worked_min)     AS worked_minutes,
                   sum(sf.overtime_min)   AS overtime_minutes
            FROM segment_final sf
            JOIN emp e         ON e.id = sf.user_id
            JOIN work_sites ws ON ws.id = sf.work_site_id
            GROUP BY e.employee_code, e.first_name, e.last_name, ws.name
            -- Sin horas no hay fila: el tramo que abre la SALIDA dura cero, y una jornada abandonada
            -- no suma nada. Emitirlos llenaría el desglose de ceros.
            HAVING sum(sf.worked_min) > 0
            ORDER BY e.first_name, e.last_name, ws.name
            LIMIT %d
            """).formatted(MAX_ROWS);

    private final NamedParameterJdbcTemplate jdbc;

    public SiteHoursService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SiteHoursRow> byWorkSite(UUID tenantId, LocalDate from, LocalDate to) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("tenant", tenantId)
                .addValue("fromTs", Timestamp.from(from.atStartOfDay().toInstant(ZoneOffset.UTC)))
                .addValue("toTsExcl", Timestamp.from(to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));

        return jdbc.query(SQL, params, (rs, i) -> {
            String code = rs.getString("employee_code");
            String name = (rs.getString("first_name") + " " + rs.getString("last_name")).trim();
            return SiteHoursRow.of(
                    code != null ? code : "—",
                    name,
                    rs.getString("work_center"),
                    rs.getDouble("worked_minutes"),
                    rs.getDouble("overtime_minutes"));
        });
    }
}
