package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.ContractPolicyPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * Lee el contrato del colaborador ({@code employment_contracts}, V33) y su proyecto con
 * {@code JdbcTemplate}, igual que {@link CompanyPolicyAdapter} y {@link ShiftZoneAdapter}: es una
 * lectura por marca dentro de la transacción del registro y una consulta sin filas no lanza, así que
 * no puede dejar la transacción rollback-only. Tampoco crea dependencia de compilación con HR.
 *
 * <p>Qué contrato cuenta para una fecha:</p>
 * <ol>
 *   <li>El no cancelado que la cubre (RN-63 garantiza que hay a lo más uno). Si es por proyecto, la
 *       marca se atribuye al proyecto y queda fuera de vigencia si el proyecto no está activo o la
 *       fecha cae fuera de las fechas del proyecto.</li>
 *   <li>Si ninguno la cubre, el más cercano en el tiempo. Si es por proyecto, la marca también se
 *       atribuye a ese proyecto, pero fuera de vigencia: es el caso de quien sigue fichando después
 *       de terminar su asignación, o antes de que empiece.</li>
 *   <li>Un contrato por turno, o ninguno, no señala nada en esta fase.</li>
 * </ol>
 */
@Repository
public class ContractPolicyAdapter implements ContractPolicyPort {

    private static final ZoneId FALLBACK = ZoneId.of("UTC");

    /** Zona del centro, si hay; si no, la de la empresa. */
    private static final String ZONE_SQL = """
            SELECT COALESCE(NULLIF(ws.timezone, ''), NULLIF(c.timezone, ''), 'UTC')
            FROM companies c
            LEFT JOIN work_sites ws ON ws.id = ? AND ws.tenant_id = c.id
            WHERE c.id = ?
            """;

    /**
     * Contratos no cancelados del colaborador, ordenados por cercanía a la fecha: primero el que la
     * cubre (distancia 0), después el que termina o empieza más cerca.
     */
    private static final String CONTRACT_SQL = """
            SELECT ec.contract_type, ec.project_id, p.status, p.starts_on, p.ends_on,
                   CASE WHEN ec.starts_on <= ? AND (ec.ends_on IS NULL OR ec.ends_on >= ?) THEN 0
                        WHEN ec.starts_on > ? THEN ec.starts_on - ?::date
                        ELSE ?::date - ec.ends_on END AS distance
            FROM employment_contracts ec
            LEFT JOIN projects p ON p.id = ec.project_id
            WHERE ec.tenant_id = ? AND ec.user_id = ? AND ec.status <> 'CANCELLED'
            ORDER BY distance, ec.starts_on DESC
            LIMIT 1
            """;

    private final JdbcTemplate jdbc;

    public ContractPolicyAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ContractDecision check(UUID tenantId, UUID userId, UUID workSiteId, Instant at) {
        if (tenantId == null || userId == null || at == null) {
            return ContractDecision.none();
        }
        LocalDate date = LocalDate.ofInstant(at, zone(tenantId, workSiteId));
        Date d = Date.valueOf(date);
        List<ContractDecision> rows = jdbc.query(CONTRACT_SQL, (rs, i) -> {
            if (!"PROJECT".equals(rs.getString("contract_type"))) {
                return ContractDecision.none();
            }
            UUID projectId = rs.getObject("project_id", UUID.class);
            boolean covers = rs.getInt("distance") == 0;
            Date start = rs.getDate("starts_on");
            Date end = rs.getDate("ends_on");
            boolean projectOk = "ACTIVE".equals(rs.getString("status"))
                    && (start == null || !date.isBefore(start.toLocalDate()))
                    && (end == null || !date.isAfter(end.toLocalDate()));
            return new ContractDecision(covers && projectOk ? Outcome.WITHIN_VALIDITY : Outcome.OUT_OF_VALIDITY,
                    projectId);
        }, d, d, d, d, d, tenantId, userId);
        return rows.isEmpty() ? ContractDecision.none() : rows.get(0);
    }

    private ZoneId zone(UUID tenantId, UUID workSiteId) {
        String tz = jdbc.query(ZONE_SQL, rs -> rs.next() ? rs.getString(1) : null, workSiteId, tenantId);
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
