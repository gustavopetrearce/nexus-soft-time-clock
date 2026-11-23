package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import com.condor.nexussoft.timeclock.hr.domain.BeyondMode;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.VacationPolicy;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import com.condor.nexussoft.timeclock.hr.domain.VacationTier;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationPolicyUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.EmployeeDirectoryQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PageResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.VacationDtos.*;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Vacaciones: política del tenant (escalera por antigüedad) y bandeja de solicitudes.
 *
 * NOTA: si tus controllers usan un context-path, elimina el prefijo "/api/v1".
 */
@RestController
@RequestMapping("/api/v1/vacations")
public class VacationController {

    private final VacationPolicyUseCase policyUseCase;
    private final VacationRequestUseCase requestUseCase;
    private final EmployeeDirectoryQuery directory;

    public VacationController(VacationPolicyUseCase policyUseCase,
                             VacationRequestUseCase requestUseCase,
                             EmployeeDirectoryQuery directory) {
        this.policyUseCase = policyUseCase;
        this.requestUseCase = requestUseCase;
        this.directory = directory;
    }

    // ---- Política ----

    @GetMapping("/policy")
    @PreAuthorize("hasAnyAuthority('vacation:manage','vacation:approve')")
    public VacationPolicyDto getPolicy(Authentication auth) {
        return toDto(policyUseCase.get(CurrentUser.tenantId(auth)));
    }

    @PutMapping("/policy")
    @PreAuthorize("hasAuthority('vacation:manage')")
    public VacationPolicyDto updatePolicy(@Valid @RequestBody VacationPolicyDto body, Authentication auth) {
        List<VacationTier> tiers = body.tiers().stream()
                .map(t -> new VacationTier(t.year(), t.days()))
                .toList();
        VacationPolicy p = policyUseCase.update(new VacationPolicyUseCase.UpdatePolicyCommand(
                CurrentUser.tenantId(auth), tiers, BeyondMode.valueOf(body.beyondMode().trim().toUpperCase()),
                body.beyondIncrementDays(), body.beyondEveryYears(),
                body.requireApproval(), body.countBusinessDaysOnly()));
        return toDto(p);
    }

    private static VacationPolicyDto toDto(VacationPolicy p) {
        List<VacationTierDto> tiers = p.tiers().stream()
                .map(t -> new VacationTierDto(t.year(), t.days()))
                .toList();
        return new VacationPolicyDto(tiers, p.beyondMode().name(),
                p.beyondIncrementDays(), p.beyondEveryYears(), p.requireApproval(), p.countBusinessDaysOnly());
    }

    // ---- Solicitudes ----

    @GetMapping("/requests")
    @PreAuthorize("hasAuthority('vacation:approve')")
    public PageResponse<VacationRequestResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        VacationStatus st = (status == null || status.isBlank()) ? null : VacationStatus.valueOf(status.trim().toUpperCase());
        PagedResult<VacationRequest> result = requestUseCase.list(CurrentUser.tenantId(auth), st, search, page, size);

        Map<UUID, EmployeeDirectoryQuery.Info> names = directory.byIds(CurrentUser.tenantId(auth),
                result.content().stream().map(VacationRequest::userId).collect(Collectors.toSet()));
        List<VacationRequestResponse> content = result.content().stream()
                .map(r -> toResponse(r, names.get(r.userId())))
                .toList();
        return PageResponse.of(content, result.page(), result.size(), result.totalElements());
    }

    @PostMapping("/requests")
    @PreAuthorize("hasAnyAuthority('vacation:request','vacation:approve')")
    public VacationRequestResponse create(@Valid @RequestBody CreateVacationRequest body, Authentication auth) {
        UUID tenantId = CurrentUser.tenantId(auth);
        UUID self = CurrentUser.userId(auth);
        UUID userId = (body.userId() == null || body.userId().isBlank())
                ? self : UUID.fromString(body.userId());
        // Solo quien aprueba vacaciones puede solicitarlas a nombre de otro colaborador.
        if (!userId.equals(self) && !hasAuthority(auth, "vacation:approve")) {
            throw new AuthorizationException("VACATION_FOR_OTHER_FORBIDDEN",
                    "Solo puedes solicitar vacaciones para ti.");
        }
        VacationRequest r = requestUseCase.create(new VacationRequestUseCase.CreateCommand(
                tenantId, userId, body.startDate(), body.endDate(), body.reason()));
        return toResponse(r, directory.byIds(tenantId, List.of(userId)).get(userId));
    }

    @PatchMapping("/requests/{id}/resolve")
    @PreAuthorize("hasAuthority('vacation:approve')")
    public VacationRequestResponse resolve(@PathVariable UUID id,
                                           @Valid @RequestBody ResolveVacationRequest body,
                                           Authentication auth) {
        boolean approve = "APPROVED".equalsIgnoreCase(body.resolution());
        if (!approve && !"REJECTED".equalsIgnoreCase(body.resolution())) {
            throw new IllegalArgumentException("resolution debe ser APPROVED o REJECTED.");
        }
        VacationRequest r = requestUseCase.resolve(new VacationRequestUseCase.ResolveCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth), approve, body.note()));
        return toResponse(r, directory.byIds(r.tenantId(), List.of(r.userId())).get(r.userId()));
    }

    private static boolean hasAuthority(Authentication auth, String authority) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> authority.equals(a.getAuthority()));
    }

    private static VacationRequestResponse toResponse(VacationRequest r, EmployeeDirectoryQuery.Info info) {
        return new VacationRequestResponse(
                r.id().toString(), r.userId().toString(),
                info == null ? null : info.fullName(),
                info == null ? null : info.employeeCode(),
                r.startDate(), r.endDate(), r.days(), r.reason(), r.status().name(),
                r.resolutionNote(), r.resolvedBy() == null ? null : r.resolvedBy().toString(),
                r.resolvedAt(), r.createdAt());
    }
}
