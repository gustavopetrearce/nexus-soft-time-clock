package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.ContractFilter;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.ProjectRef;
import com.condor.nexussoft.timeclock.hr.domain.port.out.ContractRepositoryPort;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.sql.Date;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Persistencia de contratos. Colaboradores ({@code users}), proyectos ({@code projects}) y centros
 * ({@code work_sites}) pertenecen a otros módulos: se leen con SQL nativo, como
 * {@link EmployeeDirectoryQuery}, para no crear dependencia de compilación entre módulos.
 */
@Component
public class EmploymentContractPersistenceAdapter implements ContractRepositoryPort {

    private static final String FROM = "from employment_contracts c join users u on u.id = c.user_id ";

    private final EmploymentContractJpaRepository repository;

    @PersistenceContext
    private EntityManager em;

    public EmploymentContractPersistenceAdapter(EmploymentContractJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public PagedResult<EmploymentContract> search(UUID tenantId, ContractFilter filter, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        String where = where(tenantId, filter, params);
        Query count = em.createNativeQuery("select count(*) " + FROM + where);
        params.forEach(count::setParameter);
        long total = ((Number) count.getSingleResult()).longValue();

        Query q = em.createNativeQuery("select c.* " + FROM + where
                + " order by c.starts_on desc, u.first_name, u.last_name", EmploymentContractJpaEntity.class);
        params.forEach(q::setParameter);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        @SuppressWarnings("unchecked")
        List<EmploymentContractJpaEntity> rows = q.getResultList();
        return new PagedResult<>(rows.stream().map(EmploymentContractPersistenceAdapter::toDomain).toList(),
                total, page, size);
    }

    /** Cláusula WHERE con los filtros presentes; los valores van siempre como parámetros. */
    private static String where(UUID tenantId, ContractFilter f, Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("where c.tenant_id = :tenant");
        params.put("tenant", tenantId);
        if (f.type() != null) {
            sb.append(" and c.contract_type = :type");
            params.put("type", f.type().name());
        }
        if (f.status() != null) {
            sb.append(" and c.status = :status");
            params.put("status", f.status().name());
        }
        if (f.projectId() != null) {
            sb.append(" and c.project_id = :project");
            params.put("project", f.projectId());
        }
        if (f.userId() != null) {
            sb.append(" and c.user_id = :user");
            params.put("user", f.userId());
        }
        if (f.activeOn() != null) {
            sb.append(" and c.status <> 'CANCELLED' and c.starts_on <= :on and (c.ends_on is null or c.ends_on >= :on)");
            params.put("on", Date.valueOf(f.activeOn()));
        }
        if (f.search() != null && !f.search().isBlank()) {
            sb.append(" and (lower(concat(u.first_name, ' ', u.last_name)) like :q"
                    + " or lower(coalesce(u.employee_code, '')) like :q)");
            params.put("q", "%" + escapeLike(f.search().trim().toLowerCase(Locale.ROOT)) + "%");
        }
        return sb.toString();
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    @Override
    public List<EmploymentContract> findByUser(UUID tenantId, UUID userId) {
        return repository.findByTenantIdAndUserIdOrderByStartsOnDesc(tenantId, userId).stream()
                .map(EmploymentContractPersistenceAdapter::toDomain).toList();
    }

    @Override
    public Optional<EmploymentContract> find(UUID tenantId, UUID id) {
        return repository.findById(id)
                .filter(e -> e.getTenantId().equals(tenantId))
                .map(EmploymentContractPersistenceAdapter::toDomain);
    }

    @Override
    public Optional<EmploymentContract> findCovering(UUID tenantId, UUID userId, LocalDate date) {
        @SuppressWarnings("unchecked")
        List<EmploymentContractJpaEntity> rows = em.createNativeQuery(
                        "select * from employment_contracts where tenant_id = :tenant and user_id = :user"
                                + " and status <> 'CANCELLED' and starts_on <= :on and (ends_on is null or ends_on >= :on)"
                                + " order by starts_on desc", EmploymentContractJpaEntity.class)
                .setParameter("tenant", tenantId)
                .setParameter("user", userId)
                .setParameter("on", Date.valueOf(date))
                .setMaxResults(1)
                .getResultList();
        return rows.stream().findFirst().map(EmploymentContractPersistenceAdapter::toDomain);
    }

    @Override
    public EmploymentContract save(EmploymentContract c) {
        EmploymentContractJpaEntity e = repository.findById(c.id()).orElseGet(EmploymentContractJpaEntity::new);
        e.setId(c.id());
        e.setTenantId(c.tenantId());
        e.setUserId(c.userId());
        e.setContractType(c.type());
        e.setProjectId(c.projectId());
        e.setWorkSiteId(c.workSiteId());
        e.setStartsOn(c.startsOn());
        e.setEndsOn(c.endsOn());
        e.setStatus(c.status());
        e.setNotes(c.notes());
        e.setCreatedBy(c.createdBy());
        e.setEndedBy(c.endedBy());
        e.setEndedAt(c.endedAt());
        e.setCancelledBy(c.cancelledBy());
        e.setCancelledAt(c.cancelledAt());
        e.setCancelReason(c.cancelReason());
        if (e.getCreatedAt() == null) {
            e.setCreatedAt(c.createdAt());
        }
        return toDomain(repository.saveAndFlush(e));
    }

    @Override
    public boolean overlaps(UUID tenantId, UUID userId, LocalDate start, LocalDate end, UUID excludeId) {
        // Los nulos opcionales se resuelven armando el SQL, no con parámetros nulos sin tipo.
        StringBuilder sql = new StringBuilder(
                "select count(*) from employment_contracts where tenant_id = :tenant and user_id = :user"
                        + " and status <> 'CANCELLED' and (ends_on is null or ends_on >= :start)");
        if (end != null) {
            sql.append(" and starts_on <= :end");
        }
        if (excludeId != null) {
            sql.append(" and id <> :exclude");
        }
        Query q = em.createNativeQuery(sql.toString())
                .setParameter("tenant", tenantId)
                .setParameter("user", userId)
                .setParameter("start", Date.valueOf(start));
        if (end != null) q.setParameter("end", Date.valueOf(end));
        if (excludeId != null) q.setParameter("exclude", excludeId);
        return ((Number) q.getSingleResult()).longValue() > 0;
    }

    @Override
    public boolean isCollaborator(UUID tenantId, UUID userId) {
        Number n = (Number) em.createNativeQuery(
                        "select count(*) from users where id = :id and tenant_id = :tenant and is_platform_admin = false")
                .setParameter("id", userId)
                .setParameter("tenant", tenantId)
                .getSingleResult();
        return n.longValue() > 0;
    }

    @Override
    public Optional<ProjectRef> findProject(UUID tenantId, UUID projectId) {
        return findProjects(tenantId, List.of(projectId)).values().stream().findFirst();
    }

    @Override
    public Map<UUID, ProjectRef> findProjects(UUID tenantId, Collection<UUID> projectIds) {
        Map<UUID, ProjectRef> out = new HashMap<>();
        if (projectIds == null || projectIds.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                        "select id, code, name, status, starts_on, ends_on from projects"
                                + " where tenant_id = :tenant and id in (:ids)")
                .setParameter("tenant", tenantId)
                .setParameter("ids", projectIds)
                .getResultList();
        for (Object[] r : rows) {
            UUID id = (UUID) r[0];
            out.put(id, new ProjectRef(id, (String) r[1], (String) r[2], (String) r[3], toDate(r[4]), toDate(r[5])));
        }
        return out;
    }

    @Override
    public boolean workSiteExists(UUID tenantId, UUID workSiteId) {
        Number n = (Number) em.createNativeQuery(
                        "select count(*) from work_sites where id = :id and tenant_id = :tenant")
                .setParameter("id", workSiteId)
                .setParameter("tenant", tenantId)
                .getSingleResult();
        return n.longValue() > 0;
    }

    private static LocalDate toDate(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate d) return d;
        if (o instanceof Date d) return d.toLocalDate();
        return LocalDate.parse(o.toString());
    }

    static EmploymentContract toDomain(EmploymentContractJpaEntity e) {
        return new EmploymentContract(e.getId(), e.getTenantId(), e.getUserId(), e.getContractType(),
                e.getProjectId(), e.getWorkSiteId(), e.getStartsOn(), e.getEndsOn(), e.getStatus(), e.getNotes(),
                e.getCreatedBy(), e.getEndedBy(), e.getEndedAt(), e.getCancelledBy(), e.getCancelledAt(),
                e.getCancelReason(), e.getCreatedAt());
    }
}
