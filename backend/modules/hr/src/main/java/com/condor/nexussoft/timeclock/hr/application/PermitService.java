package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.DayCounter;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.PayStatus;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitFilter;
import com.condor.nexussoft.timeclock.hr.domain.PermitReason;
import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import com.condor.nexussoft.timeclock.hr.domain.VacationPolicy;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.out.PermitRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationPolicyRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Permisos de colaboradores. Reglas:
 * <ul>
 *   <li>Lo registra el personal (admin, RR. HH., supervisor) y nace APROBADO.</li>
 *   <li>Excepción: el colaborador puede SOLICITAR una incapacidad (falta con motivo INCAPACIDAD) con
 *       observaciones obligatorias; nace PENDIENTE y el personal la aprueba o rechaza. Solo lo
 *       APROBADO cuenta en asistencia, traslapes y goce.</li>
 *   <li>Entrada tarde / salida temprano: un solo día y con la hora autorizada. Falta: rango de días.</li>
 *   <li>Sin traslape con otro permiso aprobado del mismo tipo.</li>
 *   <li>Los días de una falta se cuentan como en vacaciones (naturales o hábiles según la política).</li>
 *   <li>El goce de sueldo solo lo fija quien tiene {@code permit:pay} (RR. HH.), en el alta o después
 *       sobre un permiso que aprobó otra persona; puede re-decidirse mientras siga aprobado.</li>
 *   <li>La cancelación es definitiva.</li>
 * </ul>
 */
@Service
public class PermitService implements PermitUseCase {

    /** Tope de filas de un reporte que se exporta en el cliente. */
    static final int REPORT_LIMIT = 5000;

    private final PermitRepositoryPort permits;
    private final VacationPolicyRepositoryPort policies;

    public PermitService(PermitRepositoryPort permits, VacationPolicyRepositoryPort policies) {
        this.permits = permits;
        this.policies = policies;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResult<Permit> search(UUID tenantId, PermitFilter filter, int page, int size) {
        return permits.search(tenantId, filter == null ? PermitFilter.none() : filter, page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Permit> report(UUID tenantId, PermitFilter filter) {
        return permits.findAll(tenantId, filter == null ? PermitFilter.none() : filter, REPORT_LIMIT);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Permit> listForUser(UUID tenantId, UUID userId) {
        return permits.findByUser(tenantId, userId);
    }

    @Override
    @Transactional
    public Permit create(CreateCommand c) {
        if (c.type() == null || c.reason() == null) {
            throw new IllegalArgumentException("El tipo y el motivo del permiso son obligatorios.");
        }
        if (c.payStatus() != null && !c.canDecidePay()) {
            throw new AuthorizationException("PERMIT_PAY_FORBIDDEN",
                    "Solo RR. HH. puede decidir el goce de sueldo de un permiso.");
        }
        if (c.payStatus() == PayStatus.PENDING_REVIEW) {
            throw new IllegalArgumentException("El goce de sueldo debe ser WITH_PAY o WITHOUT_PAY.");
        }
        if (c.userId() == null || !permits.isCollaborator(c.tenantId(), c.userId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        boolean absence = c.type() == PermitType.ABSENCE;
        LocalDate start = c.startDate();
        LocalDate end = absence ? c.endDate() : start;
        if (start == null || end == null || end.isBefore(start)) {
            throw new IllegalArgumentException("El periodo es inválido: la fecha fin no puede ser anterior al inicio.");
        }
        if (absence && c.timeAt() != null) {
            throw new IllegalArgumentException("Un permiso de falta no lleva hora.");
        }
        if (!absence && c.timeAt() == null) {
            throw new IllegalArgumentException(c.type() == PermitType.LATE_ARRIVAL
                    ? "Indica la hora autorizada de llegada."
                    : "Indica la hora autorizada de salida.");
        }
        if (permits.overlaps(c.tenantId(), c.userId(), c.type(), start, end)) {
            throw new IllegalStateException("El colaborador ya tiene un permiso de este tipo que se traslapa con el periodo.");
        }
        // Un permiso de un día (entrada/salida) cuenta 1 aunque caiga en fin de semana: es un día concreto.
        int days = 1;
        if (absence) {
            VacationPolicy policy = policies.findByTenant(c.tenantId()).orElseGet(() -> VacationPolicy.defaults(c.tenantId()));
            days = DayCounter.count(start, end, policy.countBusinessDaysOnly());
        }
        if (days <= 0) {
            throw new IllegalArgumentException("El periodo no contiene días válidos.");
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        boolean payDecided = c.payStatus() != null;
        Permit permit = new Permit(
                UUID.randomUUID(), c.tenantId(), c.userId(), c.type(), c.reason(), trimToNull(c.notes()),
                start, end, days, absence ? null : c.timeAt(),
                PermitStatus.APPROVED, c.grantedBy(), null, null, null,
                payDecided ? c.payStatus() : PayStatus.PENDING_REVIEW,
                payDecided ? c.grantedBy() : null, payDecided ? now : null, null,
                null, null, null, null, now);
        return permits.save(permit);
    }

    @Override
    @Transactional
    public Permit requestIncapacity(RequestIncapacityCommand c) {
        String notes = trimToNull(c.notes());
        if (notes == null) {
            throw new IllegalArgumentException("Describe en observaciones el motivo exacto de la incapacidad.");
        }
        if (notes.length() > 500) {
            throw new IllegalArgumentException("Las observaciones no pueden exceder 500 caracteres.");
        }
        if (c.userId() == null || !permits.isCollaborator(c.tenantId(), c.userId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        LocalDate start = c.startDate();
        LocalDate end = c.endDate() == null ? start : c.endDate();
        if (start == null || end.isBefore(start)) {
            throw new IllegalArgumentException("El periodo es inválido: la fecha fin no puede ser anterior al inicio.");
        }
        if (permits.overlapsApprovedOrPending(c.tenantId(), c.userId(), PermitType.ABSENCE, start, end)) {
            throw new IllegalStateException("Ya tienes una falta o solicitud de incapacidad que se traslapa con el periodo.");
        }
        VacationPolicy policy = policies.findByTenant(c.tenantId()).orElseGet(() -> VacationPolicy.defaults(c.tenantId()));
        int days = DayCounter.count(start, end, policy.countBusinessDaysOnly());
        if (days <= 0) {
            throw new IllegalArgumentException("El periodo no contiene días válidos.");
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        return permits.save(new Permit(
                UUID.randomUUID(), c.tenantId(), c.userId(), PermitType.ABSENCE, PermitReason.INCAPACIDAD, notes,
                start, end, days, null, PermitStatus.PENDING, null, null, null, null,
                PayStatus.PENDING_REVIEW, null, null, null,
                c.userId(), null, null, null, now));
    }

    @Override
    @Transactional
    public Permit resolve(ResolveCommand c) {
        Permit p = load(c.tenantId(), c.permitId());
        if (p.status() != PermitStatus.PENDING) {
            throw new IllegalStateException("La solicitud ya fue resuelta.");
        }
        if (c.approve() && permits.overlaps(c.tenantId(), p.userId(), p.type(), p.startDate(), p.endDate())) {
            throw new IllegalStateException("El colaborador ya tiene un permiso aprobado que se traslapa con el periodo.");
        }
        return permits.save(p.resolve(c.approve(), c.resolvedBy(), trimToNull(c.note()),
                OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Override
    @Transactional
    public Permit cancel(CancelCommand c) {
        Permit p = load(c.tenantId(), c.permitId());
        if (p.status() != PermitStatus.APPROVED) {
            throw new IllegalStateException(p.status() == PermitStatus.CANCELLED
                    ? "El permiso ya fue cancelado."
                    : "Solo se cancela un permiso aprobado.");
        }
        return permits.save(p.cancel(c.cancelledBy(), trimToNull(c.note()), OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Override
    @Transactional
    public Permit decidePay(DecidePayCommand c) {
        if (c.payStatus() == null || c.payStatus() == PayStatus.PENDING_REVIEW) {
            throw new IllegalArgumentException("El goce de sueldo debe ser WITH_PAY o WITHOUT_PAY.");
        }
        Permit p = load(c.tenantId(), c.permitId());
        if (p.status() != PermitStatus.APPROVED) {
            throw new IllegalStateException("Solo se decide el goce de un permiso aprobado.");
        }
        return permits.save(p.decidePay(c.payStatus(), c.decidedBy(), trimToNull(c.note()),
                OffsetDateTime.now(ZoneOffset.UTC)));
    }

    private Permit load(UUID tenantId, UUID id) {
        return permits.find(tenantId, id).orElseThrow(() -> new NoSuchElementException("Permiso no encontrado."));
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
