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
 * {@code user:manage} ni {@code worksite:manage} (V10). Colaboradores y centros salen de
 * {@link DirectoryOptionsQuery}, la misma consulta que usan los demás formularios.
 */
@Component
public class ContractOptionsQuery {

    public record Project(UUID id, String code, String name, String status, LocalDate startsOn, LocalDate endsOn) {}

    @PersistenceContext
    private EntityManager em;

    private final DirectoryOptionsQuery directory;

    public ContractOptionsQuery(DirectoryOptionsQuery directory) {
        this.directory = directory;
    }

    public List<DirectoryOptionsQuery.Collaborator> collaborators(UUID tenantId) {
        return directory.collaborators(tenantId, null, DirectoryOptionsQuery.MAX_LIMIT);
    }

    public List<DirectoryOptionsQuery.WorkSite> workSites(UUID tenantId) {
        return directory.workSites(tenantId);
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


    private static LocalDate toDate(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate d) return d;
        if (o instanceof java.sql.Date d) return d.toLocalDate();
        return LocalDate.parse(o.toString());
    }
}
