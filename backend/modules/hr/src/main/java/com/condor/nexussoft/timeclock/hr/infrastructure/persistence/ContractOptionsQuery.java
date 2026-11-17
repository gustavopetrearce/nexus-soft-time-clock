package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Catálogos para capturar un contrato: colaboradores, proyectos y centros del tenant. Se leen aquí
 * con SQL nativo para que el formulario solo exija {@code contract:manage}; RR. HH. no tiene
 * {@code user:manage} ni {@code worksite:manage} (V10).
 */
@Component
public class ContractOptionsQuery {

    public record Collaborator(UUID id, String fullName, String employeeCode) {}

    public record Project(UUID id, String code, String name, String status, LocalDate startsOn, LocalDate endsOn) {}

    public record WorkSite(UUID id, String code, String name) {}

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<Collaborator> collaborators(UUID tenantId) {
        List<Object[]> rows = em.createNativeQuery(
                        "select id, trim(concat(first_name, ' ', last_name)), employee_code from users"
                                + " where tenant_id = :tenant and is_platform_admin = false and status <> 'INACTIVE'"
                                + " order by first_name, last_name")
                .setParameter("tenant", tenantId)
                .getResultList();
        return rows.stream().map(r -> new Collaborator((UUID) r[0], (String) r[1], (String) r[2])).toList();
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<Project> projects(UUID tenantId) {
        List<Object[]> rows = em.createNativeQuery(
                        "select id, code, name, status, starts_on, ends_on from projects"
                                + " where tenant_id = :tenant order by name")
                .setParameter("tenant", tenantId)
                .getResultList();
        return rows.stream().map(r -> new Project((UUID) r[0], (String) r[1], (String) r[2], (String) r[3],
                toDate(r[4]), toDate(r[5]))).toList();
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<WorkSite> workSites(UUID tenantId) {
        List<Object[]> rows = em.createNativeQuery(
                        "select id, code, name from work_sites where tenant_id = :tenant order by name")
                .setParameter("tenant", tenantId)
                .getResultList();
        return rows.stream().map(r -> new WorkSite((UUID) r[0], (String) r[1], (String) r[2])).toList();
    }

    private static LocalDate toDate(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate d) return d;
        if (o instanceof java.sql.Date d) return d.toLocalDate();
        return LocalDate.parse(o.toString());
    }
}
