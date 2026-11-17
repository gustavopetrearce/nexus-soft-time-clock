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
 * Desglose de horas por proyecto (CU-09, iteración 14). Reparte los mismos tramos que el resumen y el
 * desglose por centro ({@link JourneySegmentsSql}) según el proyecto que la marca heredó de su contrato
 * (RN-67), así que la suma de los proyectos de un colaborador cuadra con sus horas del resumen. Las
 * horas sin proyecto salen en su propia fila, con el proyecto nulo.
 */
@Service
public class ProjectHoursService {

    private static final int MAX_ROWS = 5000;

    private static final String SQL = sql(false);
    private static final String SQL_BY_PROJECT = sql(true);

    private static String sql(boolean byProject) {
        return ("""
            WITH """ + JourneySegmentsSql.ctes(byProject) + """
            ,
            emp AS (
                SELECT id, employee_code, first_name, last_name
                FROM users
                WHERE tenant_id = :tenant AND is_platform_admin = false
            )
            SELECT e.employee_code,
                   e.first_name,
                   e.last_name,
                   pr.code                AS project_code,
                   pr.name                AS project_name,
                   sum(sf.worked_min)     AS worked_minutes,
                   sum(sf.overtime_min)   AS overtime_minutes
            FROM segment_final sf
            JOIN emp e            ON e.id = sf.user_id
            LEFT JOIN projects pr ON pr.id = sf.project_id
            GROUP BY e.employee_code, e.first_name, e.last_name, pr.code, pr.name
            HAVING sum(sf.worked_min) > 0
            ORDER BY e.first_name, e.last_name, pr.code NULLS LAST
            LIMIT %d
            """).formatted(MAX_ROWS);
    }

    private final NamedParameterJdbcTemplate jdbc;

    public ProjectHoursService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** {@code projectId} nulo = todos los proyectos y las horas sin proyecto. */
    public List<ProjectHoursRow> byProject(UUID tenantId, LocalDate from, LocalDate to, UUID projectId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("tenant", tenantId)
                .addValue("project", projectId)
                .addValue("fromTs", Timestamp.from(from.atStartOfDay().toInstant(ZoneOffset.UTC)))
                .addValue("toTsExcl", Timestamp.from(to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));

        return jdbc.query(projectId != null ? SQL_BY_PROJECT : SQL, params, (rs, i) -> {
            String code = rs.getString("employee_code");
            String name = (rs.getString("first_name") + " " + rs.getString("last_name")).trim();
            return ProjectHoursRow.of(
                    code != null ? code : "—",
                    name,
                    rs.getString("project_code"),
                    rs.getString("project_name"),
                    rs.getDouble("worked_minutes"),
                    rs.getDouble("overtime_minutes"));
        });
    }

    /** Proyectos del tenant para el filtro de los reportes (quien exporta no tiene por qué gestionarlos). */
    public List<ProjectOption> projects(UUID tenantId) {
        return jdbc.query("SELECT id, code, name, status FROM projects WHERE tenant_id = :tenant ORDER BY code",
                new MapSqlParameterSource("tenant", tenantId),
                (rs, i) -> new ProjectOption(rs.getObject("id", UUID.class), rs.getString("code"),
                        rs.getString("name"), rs.getString("status")));
    }

    public record ProjectOption(UUID id, String code, String name, String status) {}
}
