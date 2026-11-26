package com.condor.nexussoft.timeclock.onboarding.infrastructure.persistence;

import com.condor.nexussoft.timeclock.onboarding.domain.ShiftRef;
import com.condor.nexussoft.timeclock.onboarding.domain.port.out.ImportCatalogPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Lecturas de validación de la importación con SQL directo: una consulta por concepto para todo el
 * lote. Mismo precedente que {@code TenantDirectoryAdapter} (Scheduling) y
 * {@code ActiveCollaboratorCounterAdapter} (Tenancy).
 */
@Repository
public class JdbcImportCatalogAdapter implements ImportCatalogPort {

    private final JdbcTemplate jdbc;

    public JdbcImportCatalogAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<String> existingEmails(UUID tenantId, Collection<String> emails) {
        // users.email es citext: se compara en minúsculas, igual que normaliza el VO Email.
        return new HashSet<>(jdbc.queryForList(
                "SELECT lower(email::text) FROM users WHERE tenant_id = ? AND lower(email::text) = ANY (?)",
                String.class, tenantId, emails.toArray(String[]::new)));
    }

    @Override
    public Set<String> existingEmployeeCodes(UUID tenantId, Collection<String> employeeCodes) {
        return new HashSet<>(jdbc.queryForList(
                "SELECT employee_code FROM users WHERE tenant_id = ? AND employee_code = ANY (?)",
                String.class, tenantId, employeeCodes.toArray(String[]::new)));
    }

    @Override
    public Set<String> systemRoleCodes() {
        return new HashSet<>(jdbc.queryForList("SELECT code FROM roles WHERE tenant_id IS NULL", String.class));
    }

    @Override
    public Set<String> rolesWithPermission(String permission) {
        return new HashSet<>(jdbc.queryForList("""
                SELECT r.code
                FROM roles r
                JOIN role_permissions rp ON rp.role_id = r.id
                JOIN permissions p       ON p.id = rp.permission_id
                WHERE r.tenant_id IS NULL AND p.code = ?
                """, String.class, permission));
    }

    @Override
    public List<ShiftRef> shifts(UUID tenantId) {
        return jdbc.query("""
                SELECT s.code AS schedule_code, sh.name AS shift_name, sh.id AS shift_id
                FROM shifts sh
                JOIN schedules s ON s.id = sh.schedule_id
                WHERE sh.tenant_id = ? AND s.tenant_id = ? AND s.status = 'ACTIVE'
                """,
                (rs, i) -> new ShiftRef(rs.getString("schedule_code"), rs.getString("shift_name"),
                        rs.getObject("shift_id", UUID.class)),
                tenantId, tenantId);
    }

    @Override
    public Map<String, UUID> activeWorkSites(UUID tenantId) {
        Map<String, UUID> sites = new HashMap<>();
        jdbc.query("SELECT code, id FROM work_sites WHERE tenant_id = ? AND status = 'ACTIVE'",
                rs -> {
                    sites.put(rs.getString("code"), rs.getObject("id", UUID.class));
                }, tenantId);
        return sites;
    }
}
