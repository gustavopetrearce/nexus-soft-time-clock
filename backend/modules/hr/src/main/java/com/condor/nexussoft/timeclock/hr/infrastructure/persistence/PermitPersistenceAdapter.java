package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitFilter;
import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import com.condor.nexussoft.timeclock.hr.domain.port.out.PermitRepositoryPort;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Persistencia de permisos. La bandeja filtra por nombre/número de empleado, que viven en
 * {@code users} (módulo identity); se resuelve con SQL nativo, como {@link EmployeeDirectoryQuery},
 * para no crear dependencia de compilación entre módulos.
 */
@Component
public class PermitPersistenceAdapter implements PermitRepositoryPort {

    private final PermitJpaRepository repository;

    @PersistenceContext
    private EntityManager em;

    public PermitPersistenceAdapter(PermitJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public PagedResult<Permit> search(UUID tenantId, PermitFilter filter, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        String where = where(tenantId, filter, params);
        Query count = em.createNativeQuery("select count(*) from permits p join users u on u.id = p.user_id " + where);
        params.forEach(count::setParameter);
        long total = ((Number) count.getSingleResult()).longValue();

        Query q = em.createNativeQuery("select p.* from permits p join users u on u.id = p.user_id " + where
                + " order by p.start_date desc, p.created_at desc", PermitJpaEntity.class);
        params.forEach(q::setParameter);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        return new PagedResult<>(map(q.getResultList()), total, page, size);
    }

    @Override
    public List<Permit> findAll(UUID tenantId, PermitFilter filter, int limit) {
        Map<String, Object> params = new HashMap<>();
        String where = where(tenantId, filter, params);
        Query q = em.createNativeQuery("select p.* from permits p join users u on u.id = p.user_id " + where
                + " order by p.start_date desc, u.first_name, u.last_name", PermitJpaEntity.class);
        params.forEach(q::setParameter);
        q.setMaxResults(limit);
        return map(q.getResultList());
    }

    /** Cláusula WHERE con los filtros presentes; los valores van siempre como parámetros. */
    private static String where(UUID tenantId, PermitFilter f, Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("where p.tenant_id = :tenant");
        params.put("tenant", tenantId);
        if (f.type() != null) {
            sb.append(" and p.type = :type");
            params.put("type", f.type().name());
        }
        if (f.reason() != null) {
            sb.append(" and p.reason = :reason");
            params.put("reason", f.reason().name());
        }
        if (f.payStatus() != null) {
            sb.append(" and p.pay_status = :pay");
            params.put("pay", f.payStatus().name());
        }
        if (f.status() != null) {
            sb.append(" and p.status = :status");
            params.put("status", f.status().name());
        }
        if (f.from() != null) {
            sb.append(" and p.end_date >= :fromDate");
            params.put("fromDate", f.from());
        }
        if (f.to() != null) {
            sb.append(" and p.start_date <= :toDate");
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
    private static List<Permit> map(List<?> rows) {
        return ((List<PermitJpaEntity>) rows).stream().map(PermitPersistenceAdapter::toDomain).toList();
    }

    @Override
    public List<Permit> findByUser(UUID tenantId, UUID userId) {
        return repository.findByTenantIdAndUserIdOrderByStartDateDesc(tenantId, userId).stream()
                .map(PermitPersistenceAdapter::toDomain).toList();
    }

    @Override
    public Optional<Permit> find(UUID tenantId, UUID id) {
        return repository.findById(id)
                .filter(e -> e.getTenantId().equals(tenantId))
                .map(PermitPersistenceAdapter::toDomain);
    }

    @Override
    public Permit save(Permit p) {
        PermitJpaEntity e = repository.findById(p.id()).orElseGet(PermitJpaEntity::new);
        e.setId(p.id());
        e.setTenantId(p.tenantId());
        e.setUserId(p.userId());
        e.setType(p.type());
        e.setReason(p.reason());
        e.setNotes(p.notes());
        e.setStartDate(p.startDate());
        e.setEndDate(p.endDate());
        e.setDays(p.days());
        e.setTimeAt(p.timeAt());
        e.setStatus(p.status());
        e.setGrantedBy(p.grantedBy());
        e.setCancelledBy(p.cancelledBy());
        e.setCancelledAt(p.cancelledAt());
        e.setCancelNote(p.cancelNote());
        e.setPayStatus(p.payStatus());
        e.setPayDecidedBy(p.payDecidedBy());
        e.setPayDecidedAt(p.payDecidedAt());
        e.setPayNote(p.payNote());
        if (e.getCreatedAt() == null) {
            e.setCreatedAt(p.createdAt());
        }
        return toDomain(repository.save(e));
    }

    @Override
    public boolean overlaps(UUID tenantId, UUID userId, PermitType type, LocalDate start, LocalDate end) {
        return repository.overlaps(tenantId, userId, type, start, end, PermitStatus.APPROVED);
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

    static Permit toDomain(PermitJpaEntity e) {
        return new Permit(e.getId(), e.getTenantId(), e.getUserId(), e.getType(), e.getReason(), e.getNotes(),
                e.getStartDate(), e.getEndDate(), e.getDays(), e.getTimeAt(), e.getStatus(), e.getGrantedBy(),
                e.getCancelledBy(), e.getCancelledAt(), e.getCancelNote(), e.getPayStatus(), e.getPayDecidedBy(),
                e.getPayDecidedAt(), e.getPayNote(), e.getCreatedAt());
    }
}
