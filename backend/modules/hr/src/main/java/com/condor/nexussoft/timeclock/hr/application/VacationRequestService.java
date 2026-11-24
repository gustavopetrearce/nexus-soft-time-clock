package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.DayCounter;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.VacationPolicy;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationPolicyRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationRequestRepositoryPort;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Solicitudes de vacaciones: alta (con conteo de días según política y control de traslape)
 * y resolución (aprobar/rechazar). Reglas de negocio del dominio HR.
 */
@Service
public class VacationRequestService implements VacationRequestUseCase {

    private final VacationRequestRepositoryPort requests;
    private final VacationPolicyRepositoryPort policies;

    public VacationRequestService(VacationRequestRepositoryPort requests, VacationPolicyRepositoryPort policies) {
        this.requests = requests;
        this.policies = policies;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResult<VacationRequest> list(UUID tenantId, VacationStatus status, String search, int page, int size) {
        return requests.search(tenantId, status, search, page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public List<VacationRequest> listForUser(UUID tenantId, UUID userId) {
        return requests.findByUser(tenantId, userId);
    }

    @Override
    @Transactional
    public VacationRequest create(CreateCommand c) {
        if (c.startDate() == null || c.endDate() == null || c.endDate().isBefore(c.startDate())) {
            throw new IllegalArgumentException("El periodo es inválido: la fecha fin no puede ser anterior al inicio.");
        }
        if (c.userId() == null || !requests.isTenantUser(c.tenantId(), c.userId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        if (requests.overlaps(c.tenantId(), c.userId(), c.startDate(), c.endDate())) {
            throw new IllegalStateException("El colaborador ya tiene una solicitud vigente que se traslapa con este periodo.");
        }
        VacationPolicy policy = policies.findByTenant(c.tenantId()).orElseGet(() -> VacationPolicy.defaults(c.tenantId()));
        int days = countDays(c.startDate(), c.endDate(), policy.countBusinessDaysOnly());
        if (days <= 0) {
            throw new IllegalArgumentException("El periodo no contiene días válidos.");
        }
        VacationStatus status = policy.requireApproval() ? VacationStatus.PENDING : VacationStatus.APPROVED;
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        VacationRequest request = new VacationRequest(
                UUID.randomUUID(), c.tenantId(), c.userId(), c.startDate(), c.endDate(), days,
                trimToNull(c.reason()), status,
                status == VacationStatus.APPROVED ? "Aprobación automática (política sin aprobación)" : null,
                null, status == VacationStatus.APPROVED ? now : null, now);
        return requests.save(request);
    }

    @Override
    @Transactional
    public VacationRequest resolve(ResolveCommand c) {
        VacationRequest r = requests.find(c.tenantId(), c.requestId())
                .orElseThrow(() -> new NoSuchElementException("Solicitud de vacaciones no encontrada."));
        if (r.status() != VacationStatus.PENDING) {
            throw new IllegalStateException("La solicitud ya fue resuelta.");
        }
        VacationStatus status = c.approve() ? VacationStatus.APPROVED : VacationStatus.REJECTED;
        VacationRequest resolved = new VacationRequest(
                r.id(), r.tenantId(), r.userId(), r.startDate(), r.endDate(), r.days(), r.reason(),
                status, trimToNull(c.note()), c.resolvedBy(), OffsetDateTime.now(ZoneOffset.UTC), r.createdAt());
        return requests.save(resolved);
    }

    /** Cuenta días naturales o solo hábiles (lun-vie), ambos extremos inclusive. */
    static int countDays(LocalDate start, LocalDate end, boolean businessOnly) {
        return DayCounter.count(start, end, businessOnly);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
