package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import com.condor.nexussoft.timeclock.identity.domain.port.in.UserListFilter;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Criterios del listado de usuarios (P20): búsqueda en nombre, apellidos, nombre completo y correo;
 * código de empleado parcial; estado y rol exactos. Todo sin distinguir mayúsculas y siempre
 * acotado al tenant.
 */
final class UserSpecifications {

    private UserSpecifications() {
    }

    static Specification<UserJpaEntity> matching(UUID tenantId, UserListFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();
            where.add(cb.equal(root.get("tenantId"), tenantId));

            String search = normalized(filter.search());
            if (search != null) {
                String like = "%" + search + "%";
                Expression<String> first = cb.lower(root.get("firstName"));
                Expression<String> last = cb.lower(root.get("lastName"));
                Expression<String> full = cb.concat(cb.concat(first, " "), last);
                where.add(cb.or(
                        cb.like(first, like),
                        cb.like(last, like),
                        cb.like(full, like),
                        cb.like(cb.lower(root.get("email")), like)));
            }

            String code = normalized(filter.employeeCode());
            if (code != null) {
                where.add(cb.like(cb.lower(root.get("employeeCode")), "%" + code + "%"));
            }

            String status = normalized(filter.status());
            if (status != null) {
                where.add(cb.equal(root.get("status"), status.toUpperCase(Locale.ROOT)));
            }

            String role = normalized(filter.role());
            if (role != null) {
                Join<UserJpaEntity, RoleJpaEntity> roles = root.join("roles");
                where.add(cb.equal(roles.get("code"), role.toUpperCase(Locale.ROOT)));
                query.distinct(true);
            }
            return cb.and(where.toArray(Predicate[]::new));
        };
    }

    /** Texto recortado en minúsculas, o {@code null} si viene vacío. */
    private static String normalized(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
