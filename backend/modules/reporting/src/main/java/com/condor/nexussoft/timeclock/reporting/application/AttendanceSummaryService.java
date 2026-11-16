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
 * Reporte agregado de asistencia por colaborador (RF-11).
 *
 * <p>Deriva todo al vuelo desde las tablas transaccionales (no depende del read-model {@code work_days},
 * que hoy no se puebla). La unidad de cálculo es la <b>jornada</b>: cada ENTRADA abre una y la SALIDA
 * que le sigue la cierra, así que un día con dos turnos son dos jornadas y el hueco entre ellas no
 * cuenta como trabajado (RN-12 admite varios turnos el mismo día). Supuestos, acordados con el
 * negocio:</p>
 * <ul>
 *   <li><b>Horas trabajadas</b>: por jornada, {@code SALIDA - ENTRADA} menos los descansos
 *       <b>realmente marcados</b> ({@code INICIO_DESCANSO} → {@code FIN_DESCANSO}), no el descanso
 *       nominal del turno (RN-17). Una jornada sin SALIDA no suma nada.</li>
 *   <li><b>Horas extra</b>: por jornada, {@code max(0, trabajadas - jornada neta de su turno)}, y se
 *       suman. Cada turno es un compromiso propio: salir antes de uno no compensa quedarse de más en
 *       otro. Es 0 en las jornadas sin turno atribuido.</li>
 *   <li><b>Días asistidos</b>: días distintos con al menos una ENTRADA, fechados por la ENTRADA que
 *       abre la jornada, de modo que un turno nocturno cuenta como un día y no como dos.</li>
 *   <li><b>Días esperados</b>: días hábiles (lunes-viernes) del rango, acotados a la vigencia de las
 *       asignaciones de turno cuando existen, a la fecha de ingreso ({@code hire_date}) y, si el
 *       colaborador tiene contratos (iteración 14), a los días que cubre alguno no cancelado: fuera
 *       de contrato no se le espera. La personalización por {@code schedule.config_json}
 *       queda como extensión futura (hoy ese JSON no almacena la máscara de días).</li>
 *   <li><b>Colaboradores</b>: usuarios del tenant que no son administradores de plataforma; se incluyen
 *       activos e inactivos (el front filtra por estado).</li>
 * </ul>
 *
 * <p><b>Filtro por proyecto</b> (CU-09): solo cuentan las marcas atribuidas al proyecto; aparecen
 * quienes tuvieron contrato con él en el rango o marcaron en él, y los días esperados y las
 * incidencias se limitan a los días que cubre su contrato con ese proyecto.</p>
 */
@Service
public class AttendanceSummaryService {

    private static final int MAX_ROWS = 5000;

    private static final String SQL = sql(false);
    private static final String SQL_BY_PROJECT = sql(true);

    /** Una sola consulta con CTEs; el llamador acota por tenant. */
    private static String sql(boolean byProject) {
        String contractProject = byProject ? " AND c.project_id = :project" : "";
        // Con proyecto solo se espera en los días de su contrato con él; sin filtro, quien no tiene
        // ningún contrato conserva el cálculo previo (días hábiles acotados a sus turnos).
        String coverage = byProject
                ? "EXISTS (SELECT 1 FROM contract_cov cc WHERE cc.user_id = e.id AND g::date BETWEEN cc.starts_on AND cc.ends_on)"
                : "(hc.user_id IS NULL OR EXISTS (SELECT 1 FROM contract_cov cc WHERE cc.user_id = e.id "
                  + "AND g::date BETWEEN cc.starts_on AND cc.ends_on))";
        String incidentScope = byProject
                ? " AND EXISTS (SELECT 1 FROM contract_cov cc WHERE cc.user_id = i.user_id "
                  + "AND i.incident_date BETWEEN cc.starts_on AND cc.ends_on)"
                : "";
        String empScope = byProject
                ? " AND (id IN (SELECT user_id FROM contract_cov WHERE starts_on <= :toDate AND ends_on >= :fromDate)"
                  + " OR id IN (SELECT user_id FROM punch))"
                : "";
        return ("""
            WITH """ + JourneySegmentsSql.ctes(byProject) + """
            ,
            -- Contratos no cancelados (V33); un fin abierto se trata como sin fin.
            contract_cov AS (
                SELECT c.user_id, c.starts_on, COALESCE(c.ends_on, 'infinity'::date) AS ends_on
                FROM employment_contracts c
                WHERE c.tenant_id = :tenant AND c.status <> 'CANCELLED'%1$s
            ),
            has_contract AS (
                SELECT DISTINCT user_id FROM contract_cov
            ),
            emp AS (
                SELECT id, employee_code, first_name, last_name, status
                FROM users
                WHERE tenant_id = :tenant AND is_platform_admin = false%4$s
            ),
            -- Vigencia agregada de las asignaciones: acota los días esperados. Se toma el rango
            -- completo y no "la asignación más reciente", que con varios turnos era una elección
            -- arbitraria entre empates.
            assign_span AS (
                SELECT sa.user_id,
                       min(sa.valid_from) AS valid_from,
                       CASE WHEN bool_or(sa.valid_to IS NULL) THEN NULL ELSE max(sa.valid_to) END AS valid_to
                FROM shift_assignments sa
                WHERE sa.tenant_id = :tenant
                  AND sa.valid_from <= :toDate
                  AND (sa.valid_to IS NULL OR sa.valid_to >= :fromDate)
                GROUP BY sa.user_id
            ),
            -- Centro de respaldo para quien no tiene ninguna marca en el rango.
            assign_site AS (
                SELECT DISTINCT ON (sa.user_id) sa.user_id, sa.work_site_id
                FROM shift_assignments sa
                WHERE sa.tenant_id = :tenant
                  AND sa.valid_from <= :toDate
                  AND (sa.valid_to IS NULL OR sa.valid_to >= :fromDate)
                ORDER BY sa.user_id, sa.valid_from DESC, sa.id
            ),
            worked AS (
                SELECT user_id,
                       count(DISTINCT d) AS attended_days,
                       COALESCE(sum(worked_min), 0) AS worked_minutes,
                       COALESCE(sum(overtime_min), 0) AS overtime_minutes
                FROM segment_final
                GROUP BY user_id
            ),
            -- El centro donde MÁS trabajó, que es lo que responde "dónde trabaja esta persona".
            -- Antes era el último donde marcó, y con un cambio de sitio al final del día señalaba a
            -- la sede donde había estado menos tiempo. Si no acumuló horas (jornadas abandonadas) se
            -- desempata por la marca más reciente, que es el comportamiento anterior.
            main_site AS (
                SELECT DISTINCT ON (t.user_id) t.user_id, t.site_name
                FROM (
                    SELECT sf.user_id,
                           ws.name AS site_name,
                           sum(sf.worked_min) AS worked_min,
                           max(sf.started_at) AS last_at
                    FROM segment_final sf
                    JOIN work_sites ws ON ws.id = sf.work_site_id
                    GROUP BY sf.user_id, ws.name
                ) t
                ORDER BY t.user_id, t.worked_min DESC, t.last_at DESC
            ),
            -- Permisos aprobados (V32): una FALTA en un día cubierto por un permiso de falta cuenta
            -- como justificada, y un RETARDO en un día con permiso de entrada tarde no cuenta. Las
            -- incidencias no se modifican; solo cambia cómo se clasifican aquí.
            inc_src AS (
                SELECT i.user_id, i.type, i.status,
                       EXISTS (SELECT 1 FROM permits pm
                               WHERE pm.tenant_id = i.tenant_id AND pm.user_id = i.user_id
                                 AND pm.status = 'APPROVED' AND pm.type = 'ABSENCE'
                                 AND i.incident_date BETWEEN pm.start_date AND pm.end_date) AS absence_permit,
                       EXISTS (SELECT 1 FROM permits pm
                               WHERE pm.tenant_id = i.tenant_id AND pm.user_id = i.user_id
                                 AND pm.status = 'APPROVED' AND pm.type = 'LATE_ARRIVAL'
                                 AND i.incident_date = pm.start_date) AS late_permit
                FROM incidents i
                WHERE i.tenant_id = :tenant AND i.incident_date >= :fromDate AND i.incident_date <= :toDate
                  -- Una marca cancelada (V31) no cuenta, ni el retardo/incidencia que generó.
                  AND NOT EXISTS (SELECT 1 FROM attendance_records car
                                  WHERE car.id = i.related_attendance_id
                                    AND car.tenant_id = i.tenant_id
                                    AND car.status = 'CANCELLED')%3$s
            ),
            inc AS (
                SELECT user_id,
                       count(*) FILTER (WHERE type = 'RETARDO' AND NOT late_permit) AS retardos,
                       count(*) FILTER (WHERE type IN ('PERMISO', 'JUSTIFICACION')
                                           OR (type = 'FALTA' AND (status IN ('APPROVED', 'RESOLVED')
                                                                   OR absence_permit))) AS justified,
                       count(*) FILTER (WHERE type = 'FALTA' AND status IN ('OPEN', 'REJECTED')
                                          AND NOT absence_permit) AS unjustified
                FROM inc_src
                GROUP BY user_id
            ),
            expected AS (
                SELECT e.id AS user_id,
                       (SELECT count(*) FROM generate_series(
                                GREATEST(:fromDate, COALESCE(a.valid_from, :fromDate), COALESCE(ep.hire_date, :fromDate)),
                                LEAST(:toDate, COALESCE(a.valid_to, :toDate)),
                                interval '1 day') g
                        WHERE EXTRACT(dow FROM g) BETWEEN 1 AND 5
                          AND %2$s) AS expected_days
                FROM emp e
                LEFT JOIN assign_span a ON a.user_id = e.id
                LEFT JOIN has_contract hc ON hc.user_id = e.id
                -- Antes del ingreso no se le espera (V15).
                LEFT JOIN employee_profiles ep ON ep.user_id = e.id AND ep.tenant_id = :tenant
            )
            SELECT e.employee_code,
                   e.first_name,
                   e.last_name,
                   e.status,
                   COALESCE(ms.site_name, asite.name) AS work_center,
                   COALESCE(x.expected_days, 0)       AS expected_days,
                   COALESCE(w.attended_days, 0)       AS attended_days,
                   COALESCE(i.justified, 0)           AS justified,
                   COALESCE(i.unjustified, 0)         AS unjustified,
                   COALESCE(i.retardos, 0)            AS retardos,
                   COALESCE(w.worked_minutes, 0)      AS worked_minutes,
                   COALESCE(w.overtime_minutes, 0)    AS overtime_minutes
            FROM emp e
            LEFT JOIN worked w      ON w.user_id = e.id
            LEFT JOIN inc i         ON i.user_id = e.id
            LEFT JOIN main_site ms  ON ms.user_id = e.id
            LEFT JOIN expected x    ON x.user_id = e.id
            LEFT JOIN assign_site a2 ON a2.user_id = e.id
            LEFT JOIN work_sites asite ON asite.id = a2.work_site_id
            ORDER BY e.first_name, e.last_name
            LIMIT %5$d
            """).formatted(contractProject, coverage, incidentScope, empScope, MAX_ROWS);
    }

    private final NamedParameterJdbcTemplate jdbc;

    public AttendanceSummaryService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AttendanceSummaryRow> summary(UUID tenantId, LocalDate from, LocalDate to) {
        return summary(tenantId, from, to, null);
    }

    /** {@code projectId} nulo = todos los proyectos (y las marcas sin proyecto). */
    public List<AttendanceSummaryRow> summary(UUID tenantId, LocalDate from, LocalDate to, UUID projectId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("tenant", tenantId)
                .addValue("project", projectId)
                .addValue("fromDate", from)
                .addValue("toDate", to)
                .addValue("fromTs", Timestamp.from(from.atStartOfDay().toInstant(ZoneOffset.UTC)))
                .addValue("toTsExcl", Timestamp.from(to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));

        return jdbc.query(projectId != null ? SQL_BY_PROJECT : SQL, params, (rs, i) -> {
            String code = rs.getString("employee_code");
            String name = (rs.getString("first_name") + " " + rs.getString("last_name")).trim();
            String workCenter = rs.getString("work_center");
            return AttendanceSummaryRow.of(
                    code != null ? code : "—",
                    name,
                    workCenter != null ? workCenter : "—",
                    rs.getInt("expected_days"),
                    rs.getInt("attended_days"),
                    rs.getInt("justified"),
                    rs.getInt("unjustified"),
                    rs.getInt("retardos"),
                    rs.getDouble("worked_minutes"),
                    rs.getDouble("overtime_minutes"),
                    "ACTIVE".equals(rs.getString("status")));
        });
    }
}
