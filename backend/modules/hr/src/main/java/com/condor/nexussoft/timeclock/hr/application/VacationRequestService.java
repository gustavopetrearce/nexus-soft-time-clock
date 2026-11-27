package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.DayCounter;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.VacationPolicy;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationPolicyRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationRequestRepositoryPort;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Solicitudes de vacaciones: alta (con conteo de días según política y control de traslape),
 * resolución (aprobar/rechazar) y cancelación a petición del colaborador:
 * <ul>
 *   <li>El dueño la pide, con motivo obligatorio, si la solicitud sigue PENDING o está APPROVED y
 *       aún no empieza; una sola cancelación en curso a la vez.</li>
 *   <li>RR. HH. acepta (CANCELLED, libera los días) o deniega (el estado no cambia). Aprobar o
 *       rechazar una solicitud pendiente con cancelación en curso la deniega.</li>
 *   <li>REJECTED = negativa de la empresa; CANCELLED = a petición del colaborador.</li>
 * </ul>
 */
@Service
public class VacationRequestService implements VacationRequestUseCase {

    private final VacationRequestRepositoryPort requests;
    private final VacationPolicyRepositoryPort policies;
    private final Clock clock;

    @Autowired
    public VacationRequestService(VacationRequestRepositoryPort requests, VacationPolicyRepositoryPort policies) {
        this(requests, policies, Clock.systemDefaultZone());
    }

    VacationRequestService(VacationRequestRepositoryPort requests, VacationPolicyRepositoryPort policies, Clock clock) {
        this.requests = requests;
        this.policies = policies;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResult<VacationRequest> list(UUID tenantId, VacationStatus status, boolean cancellationPending,
                                             String search, int page, int size) {
        return requests.search(tenantId, status, cancellationPending, search, page, size);
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
                null, status == VacationStatus.APPROVED ? now : null,
                null, null, null, null, null, null, now);
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
        return requests.save(r.resolve(c.approve(), c.resolvedBy(), trimToNull(c.note()), OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Override
    @Transactional
    public VacationRequest requestCancellation(RequestCancellationCommand c) {
        String reason = trimToNull(c.reason());
        if (reason == null) {
            throw new IllegalArgumentException("Indica el motivo de la cancelación.");
        }
        if (reason.length() > 500) {
            throw new IllegalArgumentException("El motivo no puede exceder 500 caracteres.");
        }
        // Solo el dueño: para cualquier otro la solicitud "no existe".
        VacationRequest r = requests.find(c.tenantId(), c.requestId())
                .filter(x -> x.userId().equals(c.requestedBy()))
                .orElseThrow(() -> new NoSuchElementException("Solicitud de vacaciones no encontrada."));
        if (r.cancellationPending()) {
            throw new IllegalStateException("Ya hay una solicitud de cancelación en revisión.");
        }
        if (!r.canRequestCancellation(today())) {
            throw new IllegalStateException(r.status() == VacationStatus.APPROVED
                    ? "Las vacaciones ya comenzaron; ya no se puede pedir su cancelación."
                    : "Solo se puede pedir la cancelación de una solicitud pendiente o aprobada.");
        }
        return requests.save(r.requestCancellation(reason, OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Override
    @Transactional
    public VacationRequest resolveCancellation(ResolveCancellationCommand c) {
        VacationRequest r = requests.find(c.tenantId(), c.requestId())
                .orElseThrow(() -> new NoSuchElementException("Solicitud de vacaciones no encontrada."));
        if (!r.cancellationPending()) {
            throw new IllegalStateException("No hay una solicitud de cancelación por resolver.");
        }
        return requests.save(r.resolveCancellation(c.accept(), c.resolvedBy(), trimToNull(c.note()),
                OffsetDateTime.now(ZoneOffset.UTC)));
    }

    /** Fecha de hoy para decidir si unas vacaciones aprobadas ya empezaron. */
    LocalDate today() {
        return LocalDate.now(clock);
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
