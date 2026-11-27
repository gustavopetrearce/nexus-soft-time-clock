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
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
            /** {@code PENDING}: solo las que tienen una cancelación pedida por el colaborador sin resolver. */
            @RequestParam(required = false) String cancellation,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        VacationStatus st = (status == null || status.isBlank()) ? null : VacationStatus.valueOf(status.trim().toUpperCase());
        boolean cancellationPending = cancellation != null && "PENDING".equalsIgnoreCase(cancellation.trim());
        PagedResult<VacationRequest> result = requestUseCase.list(CurrentUser.tenantId(auth), st, cancellationPending,
                search, page, size);
        return PageResponse.of(toResponses(result.content(), directory), result.page(), result.size(),
                result.totalElements());
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
        return toResponses(List.of(r), directory).get(0);
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
        return toResponses(List.of(r), directory).get(0);
    }

    /** Aceptar (la solicitud pasa a CANCELLED) o denegar la cancelación que pidió el colaborador. */
    @PatchMapping("/requests/{id}/cancellation/resolve")
    @PreAuthorize("hasAuthority('vacation:approve')")
    public VacationRequestResponse resolveCancellation(@PathVariable UUID id,
                                                       @Valid @RequestBody ResolveVacationCancellation body,
                                                       Authentication auth) {
        boolean accept = "ACCEPTED".equalsIgnoreCase(body.resolution());
        if (!accept && !"DENIED".equalsIgnoreCase(body.resolution())) {
            throw new IllegalArgumentException("resolution debe ser ACCEPTED o DENIED.");
        }
        VacationRequest r = requestUseCase.resolveCancellation(new VacationRequestUseCase.ResolveCancellationCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth), accept, body.note()));
        return toResponses(List.of(r), directory).get(0);
    }

    private static boolean hasAuthority(Authentication auth, String authority) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> authority.equals(a.getAuthority()));
    }

    /** Respuestas con los nombres (colaborador, quien resolvió, quien resolvió la cancelación) en un query. */
    static List<VacationRequestResponse> toResponses(Collection<VacationRequest> requests, EmployeeDirectoryQuery directory) {
        if (requests.isEmpty()) {
            return List.of();
        }
        Set<UUID> ids = new HashSet<>();
        for (VacationRequest r : requests) {
            ids.add(r.userId());
            if (r.resolvedBy() != null) ids.add(r.resolvedBy());
            if (r.cancelResolvedBy() != null) ids.add(r.cancelResolvedBy());
        }
        Map<UUID, EmployeeDirectoryQuery.Info> names = directory.byIds(requests.iterator().next().tenantId(), ids);
        LocalDate today = LocalDate.now();
        return requests.stream().map(r -> toResponse(r, names, today)).toList();
    }

    private static VacationRequestResponse toResponse(VacationRequest r, Map<UUID, EmployeeDirectoryQuery.Info> names,
                                                      LocalDate today) {
        EmployeeDirectoryQuery.Info info = names.get(r.userId());
        return new VacationRequestResponse(
                r.id().toString(), r.userId().toString(),
                info == null ? null : info.fullName(),
                info == null ? null : info.employeeCode(),
                r.startDate(), r.endDate(), r.days(), r.reason(), r.status().name(),
                r.resolutionNote(), r.resolvedBy() == null ? null : r.resolvedBy().toString(),
                r.resolvedAt(), name(names, r.resolvedBy()),
                r.cancelRequestStatus() == null ? null : r.cancelRequestStatus().name(),
                r.cancelRequestReason(), r.cancelRequestedAt(), name(names, r.cancelResolvedBy()),
                r.cancelResolvedAt(), r.cancelResolutionNote(), r.canRequestCancellation(today),
                r.createdAt());
    }

    private static String name(Map<UUID, EmployeeDirectoryQuery.Info> names, UUID id) {
        if (id == null) return null;
        EmployeeDirectoryQuery.Info i = names.get(id);
        return i == null ? null : i.fullName();
    }
}
