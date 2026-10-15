package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import com.condor.nexussoft.timeclock.tenancy.domain.port.out.ActiveCollaboratorCounterPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Cuenta los colaboradores activos del tenant (RN-35) por consulta directa a las tablas de
 * Identity, igual que Identity resuelve el tenant leyendo {@code companies}
 * ({@code CompanyDirectoryAdapter}): provisional mientras los BC no se exponen entre sí.
 *
 * <p>Dos decisiones que la regla fija y conviene no perder de vista al leer el SQL:
 * <ul>
 *   <li>Se filtra por <b>permiso efectivo</b> {@code attendance:register} y no por el código de
 *       rol {@code EMPLOYEE}: hoy coinciden, pero un rol nuevo con ese permiso debe contar.</li>
 *   <li>{@code LOCKED} e {@code INVITED} <b>consumen</b> cupo; solo {@code INACTIVE} (la baja) lo
 *       libera. Si el bloqueo temporal por intentos fallidos (RN-40) liberara cupo, al expirar
 *       solo el tenant quedaría por encima del límite sin que nadie lo autorice.</li>
 * </ul>
 */
@Repository
public class ActiveCollaboratorCounterAdapter implements ActiveCollaboratorCounterPort {

    private static final String SQL = """
            SELECT count(DISTINCT u.id)
            FROM users u
            JOIN user_roles ur       ON ur.user_id = u.id
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p       ON p.id = rp.permission_id
            WHERE u.tenant_id = ?
              AND p.code = 'attendance:register'
              AND u.status IN ('ACTIVE', 'INVITED', 'LOCKED')
            """;

    /** Misma definición de RN-35, agrupada: una sola consulta para toda una página de empresas. */
    private static final String SQL_BY_TENANT = """
            SELECT u.tenant_id, count(DISTINCT u.id) AS total
            FROM users u
            JOIN user_roles ur       ON ur.user_id = u.id
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p       ON p.id = rp.permission_id
            WHERE u.tenant_id = ANY (?)
              AND p.code = 'attendance:register'
              AND u.status IN ('ACTIVE', 'INVITED', 'LOCKED')
            GROUP BY u.tenant_id
            """;

    private final JdbcTemplate jdbc;

    public ActiveCollaboratorCounterAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long countActiveCollaborators(UUID tenantId) {
        Long count = jdbc.queryForObject(SQL, Long.class, tenantId);
        return count == null ? 0L : count;
    }

    @Override
    public Map<UUID, Long> countActiveCollaboratorsByTenant(Collection<UUID> tenantIds) {
        if (tenantIds == null || tenantIds.isEmpty()) {
            return Map.of();
        }
        UUID[] ids = tenantIds.toArray(UUID[]::new);
        Map<UUID, Long> porTenant = new HashMap<>();
        jdbc.query(SQL_BY_TENANT, rs -> {
            porTenant.put(rs.getObject("tenant_id", UUID.class), rs.getLong("total"));
        }, new Object[] { ids });
        return porTenant;
    }
}
