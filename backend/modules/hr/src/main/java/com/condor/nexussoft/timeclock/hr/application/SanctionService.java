package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Sanction;
import com.condor.nexussoft.timeclock.hr.domain.SanctionFilter;
import com.condor.nexussoft.timeclock.hr.domain.SanctionStatus;
import com.condor.nexussoft.timeclock.hr.domain.SanctionType;
import com.condor.nexussoft.timeclock.hr.domain.port.in.SanctionUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.out.SanctionRepositoryPort;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sanciones a colaboradores (V39). Reglas:
 * <ul>
 *   <li>Las abre el personal ({@code sanction:manage}: admin, RR. HH., supervisor) y nacen vigentes.</li>
 *   <li>Tipo, motivo, fecha de los hechos y descripción son obligatorios.</li>
 *   <li>La suspensión exige fecha de inicio y días (1-365); los demás tipos no los llevan.</li>
 *   <li>Anular exige motivo y es definitivo.</li>
 * </ul>
 */
@Service
public class SanctionService implements SanctionUseCase {

    static final int REPORT_LIMIT = 5000;
    static final int MAX_SUSPENSION_DAYS = 365;

    private final SanctionRepositoryPort sanctions;

    public SanctionService(SanctionRepositoryPort sanctions) {
        this.sanctions = sanctions;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResult<Sanction> search(UUID tenantId, SanctionFilter filter, int page, int size) {
        return sanctions.search(tenantId, filter == null ? SanctionFilter.none() : filter, page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Sanction> report(UUID tenantId, SanctionFilter filter) {
        return sanctions.findAll(tenantId, filter == null ? SanctionFilter.none() : filter, REPORT_LIMIT);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Sanction> listForUser(UUID tenantId, UUID userId) {
        return sanctions.findByUser(tenantId, userId);
    }

    @Override
    @Transactional
    public Sanction create(CreateCommand c) {
        if (c.type() == null || c.reason() == null || c.incidentDate() == null) {
            throw new IllegalArgumentException("El tipo, el motivo y la fecha de los hechos son obligatorios.");
        }
        String description = trimToNull(c.description());
        if (description == null) {
            throw new IllegalArgumentException("Describe los hechos que motivan la sanción.");
        }
        if (description.length() > 1000) {
            throw new IllegalArgumentException("La descripción no puede exceder 1000 caracteres.");
        }
        if (c.userId() == null || !sanctions.isCollaborator(c.tenantId(), c.userId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        boolean suspension = c.type() == SanctionType.SUSPENSION;
        if (suspension) {
            if (c.suspensionStart() == null || c.suspensionDays() == null
                    || c.suspensionDays() < 1 || c.suspensionDays() > MAX_SUSPENSION_DAYS) {
                throw new IllegalArgumentException("La suspensión requiere fecha de inicio y de 1 a "
                        + MAX_SUSPENSION_DAYS + " días.");
            }
            if (c.suspensionStart().isBefore(c.incidentDate())) {
                throw new IllegalArgumentException("La suspensión no puede empezar antes de los hechos.");
            }
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        return sanctions.save(new Sanction(UUID.randomUUID(), c.tenantId(), c.userId(), c.type(), c.reason(),
                c.incidentDate(), description, suspension ? c.suspensionStart() : null,
                suspension ? c.suspensionDays() : null, SanctionStatus.ACTIVE, c.issuedBy(),
                null, null, null, now));
    }

    @Override
    @Transactional
    public Sanction voidSanction(VoidCommand c) {
        String why = trimToNull(c.reason());
        if (why == null) {
            throw new IllegalArgumentException("Indica el motivo de la anulación.");
        }
        Sanction s = sanctions.find(c.tenantId(), c.sanctionId())
                .orElseThrow(() -> new NoSuchElementException("Sanción no encontrada."));
        if (s.status() == SanctionStatus.VOIDED) {
            throw new IllegalStateException("La sanción ya fue anulada.");
        }
        return sanctions.save(s.voided(c.voidedBy(), why, OffsetDateTime.now(ZoneOffset.UTC)));
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
