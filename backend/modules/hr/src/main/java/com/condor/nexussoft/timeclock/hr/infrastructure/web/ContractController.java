package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import com.condor.nexussoft.timeclock.hr.domain.ContractFilter;
import com.condor.nexussoft.timeclock.hr.domain.ContractStatus;
import com.condor.nexussoft.timeclock.hr.domain.ContractType;
import com.condor.nexussoft.timeclock.hr.domain.ContractView;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.ProjectRef;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.ContractOptionsQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.DirectoryOptionsQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.EmployeeDirectoryQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.ContractDtos.*;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PageResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Contratos de colaboradores (RF-30), con {@code contract:manage} (admin de empresa y RR. HH.).
 * <ul>
 *   <li>{@code GET /api/v1/contracts} — listado con filtros (tipo, estado, proyecto, vigente en una fecha).</li>
 *   <li>{@code GET /api/v1/users/{userId}/contracts} — historial de un colaborador.</li>
 *   <li>{@code POST}, {@code PUT /{id}}, {@code PATCH /{id}/end}, {@code PATCH /{id}/cancel}.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1")
@PreAuthorize("hasAuthority('contract:manage')")
public class ContractController {

    private final ContractUseCase useCase;
    private final EmployeeDirectoryQuery directory;
    private final ContractOptionsQuery options;

    public ContractController(ContractUseCase useCase, EmployeeDirectoryQuery directory, ContractOptionsQuery options) {
        this.useCase = useCase;
        this.directory = directory;
        this.options = options;
    }

    public record ContractOptionsResponse(List<DirectoryOptionsQuery.Collaborator> collaborators,
                                          List<ContractOptionsQuery.Project> projects,
                                          List<DirectoryOptionsQuery.WorkSite> workSites) {}

    @GetMapping("/contracts")
    public PageResponse<ContractResponse> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate activeOn,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        ContractFilter filter = new ContractFilter(parse(ContractType.class, type), parse(ContractStatus.class, status),
                projectId, userId, activeOn, search);
        PagedResult<ContractView> r = useCase.search(CurrentUser.tenantId(auth), filter,
                Math.max(0, page), Math.min(Math.max(1, size), 200));
        return PageResponse.of(toResponses(r.content()), r.page(), r.size(), r.totalElements());
    }

    /** Catálogos del formulario (colaboradores, proyectos y centros) con el mismo permiso. */
    @GetMapping("/contracts/options")
    public ContractOptionsResponse options(Authentication auth) {
        UUID tenant = CurrentUser.tenantId(auth);
        return new ContractOptionsResponse(options.collaborators(tenant), options.projects(tenant),
                options.workSites(tenant));
    }

    @GetMapping("/users/{userId}/contracts")
    public List<ContractResponse> listForUser(@PathVariable UUID userId, Authentication auth) {
        return toResponses(useCase.listForUser(CurrentUser.tenantId(auth), userId));
    }

    @PostMapping("/contracts")
    public ContractResponse create(@Valid @RequestBody CreateContractRequest body, Authentication auth) {
        ContractView v = useCase.create(new ContractUseCase.CreateCommand(
                CurrentUser.tenantId(auth), uuid(body.userId(), "userId"), CurrentUser.userId(auth),
                parseRequired(ContractType.class, body.type(), "type"),
                uuid(body.projectId(), "projectId"), uuid(body.workSiteId(), "workSiteId"),
                body.startsOn(), body.endsOn(), body.notes()));
        return toResponses(List.of(v)).get(0);
    }

    @PutMapping("/contracts/{id}")
    public ContractResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateContractRequest body,
                                   Authentication auth) {
        ContractView v = useCase.update(new ContractUseCase.UpdateCommand(
                CurrentUser.tenantId(auth), id, uuid(body.workSiteId(), "workSiteId"),
                body.startsOn(), body.endsOn(), body.notes()));
        return toResponses(List.of(v)).get(0);
    }

    @PatchMapping("/contracts/{id}/end")
    public ContractResponse end(@PathVariable UUID id, @Valid @RequestBody EndContractRequest body,
                                Authentication auth) {
        ContractView v = useCase.end(new ContractUseCase.EndCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth), body.endDate()));
        return toResponses(List.of(v)).get(0);
    }

    @PatchMapping("/contracts/{id}/cancel")
    public ContractResponse cancel(@PathVariable UUID id, @Valid @RequestBody CancelContractRequest body,
                                   Authentication auth) {
        ContractView v = useCase.cancel(new ContractUseCase.CancelCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth), body.reason()));
        return toResponses(List.of(v)).get(0);
    }

    // ---- mapeo ----

    /** Enriquecer con nombres en un solo query (colaborador y quienes registraron, terminaron o cancelaron). */
    private List<ContractResponse> toResponses(Collection<ContractView> views) {
        Set<UUID> ids = new HashSet<>();
        for (ContractView v : views) {
            EmploymentContract c = v.contract();
            ids.add(c.userId());
            if (c.createdBy() != null) ids.add(c.createdBy());
            if (c.endedBy() != null) ids.add(c.endedBy());
            if (c.cancelledBy() != null) ids.add(c.cancelledBy());
        }
        Map<UUID, EmployeeDirectoryQuery.Info> names = directory.byIds(ids);
        return views.stream().map(v -> toResponse(v, names)).toList();
    }

    private static ContractResponse toResponse(ContractView v, Map<UUID, EmployeeDirectoryQuery.Info> names) {
        EmploymentContract c = v.contract();
        ProjectRef p = v.project();
        EmployeeDirectoryQuery.Info user = names.get(c.userId());
        return new ContractResponse(
                c.id().toString(), c.userId().toString(),
                user == null ? null : user.fullName(),
                user == null ? null : user.employeeCode(),
                c.type().name(),
                c.projectId() == null ? null : c.projectId().toString(),
                p == null ? null : p.code(), p == null ? null : p.name(), p == null ? null : p.status(),
                p == null ? null : p.startsOn(), p == null ? null : p.endsOn(),
                c.workSiteId() == null ? null : c.workSiteId().toString(),
                c.startsOn(), c.endsOn(), c.status().name(), v.needsReview(), c.notes(),
                name(names, c.createdBy()), name(names, c.endedBy()), c.endedAt(),
                name(names, c.cancelledBy()), c.cancelledAt(), c.cancelReason(), c.createdAt());
    }

    private static String name(Map<UUID, EmployeeDirectoryQuery.Info> names, UUID id) {
        if (id == null) return null;
        EmployeeDirectoryQuery.Info i = names.get(id);
        return i == null ? null : i.fullName();
    }

    private static UUID uuid(String value, String field) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException(field + " inválido: " + value);
        }
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Valor inválido: " + value);
        }
    }

    private static <E extends Enum<E>> E parseRequired(Class<E> type, String value, String field) {
        E e = parse(type, value);
        if (e == null) throw new IllegalArgumentException(field + " es obligatorio.");
        return e;
    }
}
