package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.ContractFilter;
import com.condor.nexussoft.timeclock.hr.domain.ContractStatus;
import com.condor.nexussoft.timeclock.hr.domain.ContractType;
import com.condor.nexussoft.timeclock.hr.domain.ContractView;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.ProjectRef;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.out.ContractRepositoryPort;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contratos de colaboradores (RF-30). Reglas:
 * <ul>
 *   <li>RN-63: sin traslape entre contratos no cancelados del mismo colaborador.</li>
 *   <li>RN-64: un contrato PROJECT requiere un proyecto ACTIVE al registrarse y su vigencia cabe en
 *       la del proyecto; si el proyecto tiene fin y el contrato no, hereda ese fin.</li>
 *   <li>RN-65: si el proyecto cambia después, el contrato se marca "por revisar"; no se corrige solo.</li>
 *   <li>El tipo y el proyecto no se editan; solo se editan contratos ACTIVE.</li>
 *   <li>Terminar recorta la vigencia (no la amplía); cancelar es definitivo y exige causa.</li>
 * </ul>
 */
@Service
public class ContractService implements ContractUseCase {

    private final ContractRepositoryPort contracts;

    public ContractService(ContractRepositoryPort contracts) {
        this.contracts = contracts;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResult<ContractView> search(UUID tenantId, ContractFilter filter, int page, int size) {
        PagedResult<EmploymentContract> r = contracts.search(tenantId,
                filter == null ? ContractFilter.none() : filter, page, size);
        return new PagedResult<>(views(tenantId, r.content()), r.totalElements(), r.page(), r.size());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ContractView> listForUser(UUID tenantId, UUID userId) {
        return views(tenantId, contracts.findByUser(tenantId, userId));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EmploymentContract> findActive(UUID tenantId, UUID userId, LocalDate date) {
        return contracts.findCovering(tenantId, userId, date);
    }

    @Override
    @Transactional
    public ContractView create(CreateCommand c) {
        if (c.type() == null) {
            throw new IllegalArgumentException("El tipo de contrato es obligatorio.");
        }
        if (c.userId() == null || !contracts.isCollaborator(c.tenantId(), c.userId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        LocalDate end = c.endsOn();
        ProjectRef project = null;
        if (c.type() == ContractType.PROJECT) {
            if (c.projectId() == null) {
                throw new IllegalArgumentException("Un contrato por proyecto requiere el proyecto.");
            }
            project = requireProject(c.tenantId(), c.projectId());
            if (!project.isActive()) {
                throw new IllegalStateException("El proyecto " + project.code() + " no está activo.");
            }
            if (end == null) {
                end = project.endsOn();
            }
        } else if (c.projectId() != null) {
            throw new IllegalArgumentException("Un contrato por turno no lleva proyecto.");
        }
        validateTerms(c.tenantId(), c.userId(), project, c.workSiteId(), c.startsOn(), end, null);

        EmploymentContract contract = new EmploymentContract(
                UUID.randomUUID(), c.tenantId(), c.userId(), c.type(),
                c.type() == ContractType.PROJECT ? c.projectId() : null, c.workSiteId(),
                c.startsOn(), end, ContractStatus.ACTIVE, trimToNull(c.notes()), c.createdBy(),
                null, null, null, null, null, OffsetDateTime.now(ZoneOffset.UTC));
        return view(contracts.save(contract), project);
    }

    @Override
    @Transactional
    public ContractView update(UpdateCommand c) {
        EmploymentContract current = load(c.tenantId(), c.contractId());
        if (current.status() != ContractStatus.ACTIVE) {
            throw new IllegalStateException("Solo se puede editar un contrato activo.");
        }
        ProjectRef project = current.type() == ContractType.PROJECT
                ? requireProject(c.tenantId(), current.projectId()) : null;
        validateTerms(c.tenantId(), current.userId(), project, c.workSiteId(), c.startsOn(), c.endsOn(), current.id());
        EmploymentContract updated = current.withTerms(c.workSiteId(), c.startsOn(), c.endsOn(), trimToNull(c.notes()));
        return view(contracts.save(updated), project);
    }

    @Override
    @Transactional
    public ContractView end(EndCommand c) {
        EmploymentContract current = load(c.tenantId(), c.contractId());
        if (current.status() != ContractStatus.ACTIVE) {
            throw new IllegalStateException("Solo se puede terminar un contrato activo.");
        }
        if (c.endDate() == null || c.endDate().isBefore(current.startsOn())) {
            throw new IllegalArgumentException("La fecha de término no puede ser anterior al inicio del contrato.");
        }
        if (current.endsOn() != null && c.endDate().isAfter(current.endsOn())) {
            throw new IllegalArgumentException("La fecha de término no puede ampliar el contrato; edítalo para eso.");
        }
        EmploymentContract ended = current.end(c.endDate(), c.endedBy(), OffsetDateTime.now(ZoneOffset.UTC));
        return view(contracts.save(ended), projectOf(c.tenantId(), ended));
    }

    @Override
    @Transactional
    public ContractView cancel(CancelCommand c) {
        EmploymentContract current = load(c.tenantId(), c.contractId());
        if (current.status() == ContractStatus.CANCELLED) {
            throw new IllegalStateException("El contrato ya fue cancelado.");
        }
        String reason = trimToNull(c.reason());
        if (reason == null) {
            throw new IllegalArgumentException("Indica la causa de la cancelación.");
        }
        EmploymentContract cancelled = current.cancel(reason, c.cancelledBy(), OffsetDateTime.now(ZoneOffset.UTC));
        return view(contracts.save(cancelled), projectOf(c.tenantId(), cancelled));
    }

    // ---- reglas ----

    private void validateTerms(UUID tenantId, UUID userId, ProjectRef project, UUID workSiteId,
                               LocalDate start, LocalDate end, UUID excludeId) {
        if (start == null) {
            throw new IllegalArgumentException("La fecha de inicio es obligatoria.");
        }
        if (end != null && end.isBefore(start)) {
            throw new IllegalArgumentException("El periodo es inválido: la fecha fin no puede ser anterior al inicio.");
        }
        if (project != null && !EmploymentContract.fitsIn(project, start, end)) {
            throw new IllegalArgumentException("El contrato debe quedar dentro de la vigencia del proyecto "
                    + project.code() + " (" + describe(project.startsOn()) + " a " + describe(project.endsOn()) + ").");
        }
        if (workSiteId != null && !contracts.workSiteExists(tenantId, workSiteId)) {
            throw new NoSuchElementException("Centro de trabajo no encontrado.");
        }
        if (contracts.overlaps(tenantId, userId, start, end, excludeId)) {
            throw new IllegalStateException("El colaborador ya tiene un contrato que se traslapa con el periodo.");
        }
    }

    private static String describe(LocalDate d) {
        return d == null ? "sin límite" : d.toString();
    }

    private ProjectRef requireProject(UUID tenantId, UUID projectId) {
        return contracts.findProject(tenantId, projectId)
                .orElseThrow(() -> new NoSuchElementException("Proyecto no encontrado."));
    }

    private ProjectRef projectOf(UUID tenantId, EmploymentContract c) {
        return c.projectId() == null ? null : contracts.findProject(tenantId, c.projectId()).orElse(null);
    }

    private EmploymentContract load(UUID tenantId, UUID id) {
        return contracts.find(tenantId, id).orElseThrow(() -> new NoSuchElementException("Contrato no encontrado."));
    }

    private List<ContractView> views(UUID tenantId, Collection<EmploymentContract> list) {
        List<UUID> projectIds = list.stream().map(EmploymentContract::projectId).filter(Objects::nonNull)
                .distinct().toList();
        Map<UUID, ProjectRef> projects = projectIds.isEmpty() ? Map.of() : contracts.findProjects(tenantId, projectIds);
        return list.stream().map(c -> view(c, c.projectId() == null ? null : projects.get(c.projectId()))).toList();
    }

    private static ContractView view(EmploymentContract c, ProjectRef project) {
        return new ContractView(c, project, c.needsReview(project));
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
