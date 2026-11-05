package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import com.condor.nexussoft.timeclock.identity.domain.port.out.CompanyDirectoryPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Resuelve el tenant por código de empresa o dominio de email vía consulta directa a
 * la tabla companies. Provisional hasta que el BC Tenancy exponga su servicio (ver puerto).
 */
@Repository
public class CompanyDirectoryAdapter implements CompanyDirectoryPort {

    private final JdbcTemplate jdbc;

    public CompanyDirectoryAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<UUID> resolveActiveTenant(String companyCodeOrEmailDomain) {
        if (companyCodeOrEmailDomain == null || companyCodeOrEmailDomain.isBlank()) {
            return Optional.empty();
        }
        String ref = companyCodeOrEmailDomain.trim();
        return jdbc.query(
                "SELECT id FROM companies "
                        + "WHERE status = 'ACTIVE' AND (lower(code) = lower(?) OR email_domain = ?) "
                        + "LIMIT 1",
                rs -> rs.next() ? Optional.of(rs.getObject("id", UUID.class)) : Optional.empty(),
                ref, ref);
    }

    @Override
    public boolean isActiveTenant(UUID tenantId) {
        Integer found = jdbc.queryForObject(
                "SELECT count(*) FROM companies WHERE id = ? AND status = 'ACTIVE'", Integer.class, tenantId);
        return found != null && found > 0;
    }
}
