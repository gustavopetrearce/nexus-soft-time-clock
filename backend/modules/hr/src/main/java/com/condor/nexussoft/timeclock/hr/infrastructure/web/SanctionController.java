package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Sanction;
import com.condor.nexussoft.timeclock.hr.domain.SanctionFilter;
import com.condor.nexussoft.timeclock.hr.domain.SanctionReason;
import com.condor.nexussoft.timeclock.hr.domain.SanctionStatus;
import com.condor.nexussoft.timeclock.hr.domain.SanctionType;
import com.condor.nexussoft.timeclock.hr.domain.port.in.SanctionUseCase;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.EmployeeDirectoryQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PageResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.SanctionDtos.*;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Sanciones (V39): bandeja, alta y anulación por el personal ({@code sanction:manage}: admin,
 * RR. HH., supervisor). El colaborador ve las suyas en {@code GET /api/v1/me/sanctions}.
 */
@RestController
@RequestMapping("/api/v1/sanctions")
@PreAuthorize("hasAuthority('sanction:manage')")
public class SanctionController {

    private final SanctionUseCase useCase;
    private final EmployeeDirectoryQuery directory;

    public SanctionController(SanctionUseCase useCase, EmployeeDirectoryQuery directory) {
        this.useCase = useCase;
        this.directory = directory;
    }

    @GetMapping
    public PageResponse<SanctionResponse> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        PagedResult<Sanction> result = useCase.search(CurrentUser.tenantId(auth),
                filter(type, reason, status, from, to, search), Math.max(0, page), Math.min(Math.max(1, size), 200));
        return PageResponse.of(toResponses(result.content(), directory), result.page(), result.size(),
                result.totalElements());
    }

    /** Lista completa (acotada) con los mismos filtros, para exportar en el cliente. */
    @GetMapping("/report")
    public List<SanctionResponse> report(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String search,
            Authentication auth) {
        return toResponses(useCase.report(CurrentUser.tenantId(auth), filter(type, reason, status, from, to, search)),
                directory);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SanctionResponse create(@Valid @RequestBody CreateSanctionRequest body, Authentication auth) {
        Sanction s = useCase.create(new SanctionUseCase.CreateCommand(
                CurrentUser.tenantId(auth), UUID.fromString(body.userId()), CurrentUser.userId(auth),
                parseRequired(SanctionType.class, body.type(), "type"),
                parseRequired(SanctionReason.class, body.reason(), "reason"),
                body.incidentDate(), body.description(), body.suspensionStart(), body.suspensionDays()));
        return toResponses(List.of(s), directory).get(0);
    }

    @PatchMapping("/{id}/void")
    public SanctionResponse voidSanction(@PathVariable UUID id, @Valid @RequestBody VoidSanctionRequest body,
                                         Authentication auth) {
        Sanction s = useCase.voidSanction(new SanctionUseCase.VoidCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth), body.reason()));
        return toResponses(List.of(s), directory).get(0);
    }

    private static SanctionFilter filter(String type, String reason, String status, LocalDate from, LocalDate to,
                                         String search) {
        return new SanctionFilter(parse(SanctionType.class, type), parse(SanctionReason.class, reason),
                parse(SanctionStatus.class, status), from, to, search);
    }

    /** Respuestas con los nombres (colaborador, quien la abrió, quien la anuló) en un solo query. */
    static List<SanctionResponse> toResponses(Collection<Sanction> sanctions, EmployeeDirectoryQuery directory) {
        if (sanctions.isEmpty()) {
            return List.of();
        }
        Set<UUID> ids = new HashSet<>();
        for (Sanction s : sanctions) {
            ids.add(s.userId());
            if (s.issuedBy() != null) ids.add(s.issuedBy());
            if (s.voidedBy() != null) ids.add(s.voidedBy());
        }
        Map<UUID, EmployeeDirectoryQuery.Info> names = directory.byIds(sanctions.iterator().next().tenantId(), ids);
        return sanctions.stream().map(s -> {
            EmployeeDirectoryQuery.Info user = names.get(s.userId());
            return new SanctionResponse(s.id().toString(), s.userId().toString(),
                    user == null ? null : user.fullName(), user == null ? null : user.employeeCode(),
                    s.type().name(), s.reason().name(), s.incidentDate(), s.description(),
                    s.suspensionStart(), s.suspensionDays(), s.suspensionEnd(), s.status().name(),
                    name(names, s.issuedBy()), name(names, s.voidedBy()), s.voidedAt(), s.voidReason(),
                    s.createdAt());
        }).toList();
    }

    private static String name(Map<UUID, EmployeeDirectoryQuery.Info> names, UUID id) {
        if (id == null) return null;
        EmployeeDirectoryQuery.Info i = names.get(id);
        return i == null ? null : i.fullName();
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
