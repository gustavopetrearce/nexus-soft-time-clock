package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consulta de solo lectura para enriquecer las respuestas de vacaciones con el nombre y
 * el código de empleado (viven en la tabla users, propiedad del módulo identity). Se accede
 * por SQL nativo para no crear una dependencia de compilación entre módulos.
 */
@Component
public class EmployeeDirectoryQuery {

    public record Info(String fullName, String employeeCode, String email) {}

    @PersistenceContext
    private EntityManager em;

    /**
     * Nombres de los usuarios del tenant indicado. Los ids de otro tenant se ignoran: nunca
     * se devuelven datos de usuarios de otra empresa.
     */
    @Transactional(readOnly = true)
    public Map<UUID, Info> byIds(UUID tenantId, Collection<UUID> userIds) {
        Map<UUID, Info> map = new HashMap<>();
        if (tenantId == null || userIds == null || userIds.isEmpty()) {
            return map;
        }
        @SuppressWarnings("unchecked")
        var rows = em.createNativeQuery(
                        "select id, trim(concat(first_name, ' ', last_name)) as full_name, employee_code, email "
                                + "from users where id in (:ids) and tenant_id = :tenant")
                .setParameter("ids", userIds)
                .setParameter("tenant", tenantId)
                .getResultList();
        for (Object row : rows) {
            Object[] cols = (Object[]) row;
            UUID id = (UUID) cols[0];
            String name = cols[1] == null ? null : cols[1].toString();
            String code = cols[2] == null ? null : cols[2].toString();
            String email = cols[3] == null ? null : cols[3].toString();
            map.put(id, new Info(name, code, email));
        }
        return map;
    }

    /** Verdadero si el usuario existe y pertenece al tenant indicado. */
    @Transactional(readOnly = true)
    public boolean belongsTo(UUID tenantId, UUID userId) {
        if (tenantId == null || userId == null) {
            return false;
        }
        Number n = (Number) em.createNativeQuery("select count(*) from users where id = :id and tenant_id = :tenant")
                .setParameter("id", userId)
                .setParameter("tenant", tenantId)
                .getSingleResult();
        return n.longValue() > 0;
    }
}
