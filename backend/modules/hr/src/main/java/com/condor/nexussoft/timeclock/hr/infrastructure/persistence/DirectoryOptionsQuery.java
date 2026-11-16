package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Catálogos mínimos (colaboradores y centros) para los selectores de los formularios de RR. HH. y
 * supervisión: permisos, vacaciones, asignación de turnos y contratos. Quien captura esos formularios
 * no tiene por qué tener {@code user:manage} ni {@code worksite:manage} (V10), así que se leen aquí con
 * SQL nativo y solo exponen id, nombre y código: nada de correo, roles ni estado.
 */
@Component
public class DirectoryOptionsQuery {

    /** Tope de filas por consulta: los selectores buscan, no paginan. */
    public static final int MAX_LIMIT = 500;

    public record Collaborator(UUID id, String fullName, String employeeCode) {}

    public record WorkSite(UUID id, String code, String name) {}

    @PersistenceContext
    private EntityManager em;

    /**
     * Colaboradores activos del tenant (sin administradores de plataforma), por nombre. {@code search}
     * filtra por nombre completo o número de empleado, sin distinguir mayúsculas; vacío = todos.
     */
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<Collaborator> collaborators(UUID tenantId, String search, int limit) {
        boolean filtered = search != null && !search.isBlank();
        String sql = "select id, trim(concat(first_name, ' ', last_name)), employee_code from users"
                + " where tenant_id = :tenant and is_platform_admin = false and status <> 'INACTIVE'"
                + (filtered
                        ? " and (concat(first_name, ' ', last_name) ilike :q or coalesce(employee_code, '') ilike :q)"
                        : "")
                + " order by first_name, last_name, id";
        var query = em.createNativeQuery(sql).setParameter("tenant", tenantId)
                .setMaxResults(Math.min(Math.max(1, limit), MAX_LIMIT));
        if (filtered) {
            query.setParameter("q", "%" + escapeLike(search.trim()) + "%");
        }
        List<Object[]> rows = query.getResultList();
        return rows.stream().map(r -> new Collaborator((UUID) r[0], (String) r[1], (String) r[2])).toList();
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<WorkSite> workSites(UUID tenantId) {
        List<Object[]> rows = em.createNativeQuery(
                        "select id, code, name from work_sites where tenant_id = :tenant order by name")
                .setParameter("tenant", tenantId)
                .setMaxResults(MAX_LIMIT)
                .getResultList();
        return rows.stream().map(r -> new WorkSite((UUID) r[0], (String) r[1], (String) r[2])).toList();
    }

    /** Escapa los comodines de LIKE para que "50%" busque literalmente. */
    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
