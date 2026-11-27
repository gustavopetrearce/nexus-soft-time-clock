package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Sanction;
import com.condor.nexussoft.timeclock.hr.domain.SanctionFilter;
import com.condor.nexussoft.timeclock.hr.domain.port.out.SanctionRepositoryPort;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Persistencia de sanciones. Como en permisos, la búsqueda por nombre/número de empleado se resuelve
 * con SQL nativo contra {@code users} para no depender del módulo identity.
 */
@Component
public class SanctionPersistenceAdapter implements SanctionRepositoryPort {

    private static final String FROM = "select s.* from sanctions s join users u on u.id = s.user_id ";

    private final SanctionJpaRepository repository;

    @PersistenceContext
    private EntityManager em;

    public SanctionPersistenceAdapter(SanctionJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public PagedResult<Sanction> search(UUID tenantId, SanctionFilter filter, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        String where = where(tenantId, filter, params);
        Query count = em.createNativeQuery("select count(*) from sanctions s join users u on u.id = s.user_id " + where);
        params.forEach(count::setParameter);
        long total = ((Number) count.getSingleResult()).longValue();

        Query q = em.createNativeQuery(FROM + where + " order by s.incident_date desc, s.created_at desc",
                SanctionJpaEntity.class);
        params.forEach(q::setParameter);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        return new PagedResult<>(map(q.getResultList()), total, page, size);
    }

    @Override
    public List<Sanction> findAll(UUID tenantId, SanctionFilter filter, int limit) {
        Map<String, Object> params = new HashMap<>();
        String where = where(tenantId, filter, params);
        Query q = em.createNativeQuery(FROM + where + " order by s.incident_date desc, u.first_name, u.last_name",
                SanctionJpaEntity.class);
        params.forEach(q::setParameter);
        q.setMaxResults(limit);
        return map(q.getResultList());
    }

    private static String where(UUID tenantId, SanctionFilter f, Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("where s.tenant_id = :tenant");
        params.put("tenant", tenantId);
        if (f.type() != null) {
            sb.append(" and s.type = :type");
            params.put("type", f.type().name());
        }
        if (f.reason() != null) {
            sb.append(" and s.reason = :reason");
            params.put("reason", f.reason().name());
        }
        if (f.status() != null) {
            sb.append(" and s.status = :status");
            params.put("status", f.status().name());
        }
        if (f.from() != null) {
            sb.append(" and s.incident_date >= :fromDate");
            params.put("fromDate", f.from());
        }
        if (f.to() != null) {
            sb.append(" and s.incident_date <= :toDate");
            params.put("toDate", f.to());
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

    @SuppressWarnings("unchecked")
    private static List<Sanction> map(List<?> rows) {
        return ((List<SanctionJpaEntity>) rows).stream().map(SanctionPersistenceAdapter::toDomain).toList();
    }

    @Override
    public List<Sanction> findByUser(UUID tenantId, UUID userId) {
        return repository.findByTenantIdAndUserIdOrderByIncidentDateDescCreatedAtDesc(tenantId, userId).stream()
                .map(SanctionPersistenceAdapter::toDomain).toList();
    }

    @Override
    public Optional<Sanction> find(UUID tenantId, UUID id) {
        return repository.findById(id).filter(e -> e.getTenantId().equals(tenantId))
                .map(SanctionPersistenceAdapter::toDomain);
    }

    @Override
    public Sanction save(Sanction s) {
        SanctionJpaEntity e = repository.findById(s.id()).orElseGet(SanctionJpaEntity::new);
        e.setId(s.id());
        e.setTenantId(s.tenantId());
        e.setUserId(s.userId());
        e.setType(s.type());
        e.setReason(s.reason());
        e.setIncidentDate(s.incidentDate());
        e.setDescription(s.description());
        e.setSuspensionStart(s.suspensionStart());
        e.setSuspensionDays(s.suspensionDays());
        e.setStatus(s.status());
        e.setIssuedBy(s.issuedBy());
        e.setVoidedBy(s.voidedBy());
        e.setVoidedAt(s.voidedAt());
        e.setVoidReason(s.voidReason());
        if (e.getCreatedAt() == null) {
            e.setCreatedAt(s.createdAt());
        }
        return toDomain(repository.save(e));
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

    static Sanction toDomain(SanctionJpaEntity e) {
        return new Sanction(e.getId(), e.getTenantId(), e.getUserId(), e.getType(), e.getReason(),
                e.getIncidentDate(), e.getDescription(), e.getSuspensionStart(), e.getSuspensionDays(),
                e.getStatus(), e.getIssuedBy(), e.getVoidedBy(), e.getVoidedAt(), e.getVoidReason(), e.getCreatedAt());
    }
}
