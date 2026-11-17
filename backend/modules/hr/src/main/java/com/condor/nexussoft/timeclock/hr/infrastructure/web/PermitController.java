package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.PayStatus;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitFilter;
import com.condor.nexussoft.timeclock.hr.domain.PermitReason;
import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.EmployeeDirectoryQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PageResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PermitDtos.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Permisos: bandeja (formato reporte), alta por el personal, cancelación, goce de sueldo
 * (solo RR. HH.) y reporte de incapacidades.
 *
 * <ul>
 *   <li>{@code permit:manage} — admin, RR. HH., supervisor: ver, registrar, cancelar.</li>
 *   <li>{@code permit:pay} — RR. HH.: decidir con/sin goce de sueldo.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/permits")
public class PermitController {

    static final String PAY_AUTHORITY = "permit:pay";

    private final PermitUseCase useCase;
    private final EmployeeDirectoryQuery directory;

    public PermitController(PermitUseCase useCase, EmployeeDirectoryQuery directory) {
        this.useCase = useCase;
        this.directory = directory;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('permit:manage','permit:pay')")
    public PageResponse<PermitResponse> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String payStatus,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        PermitFilter filter = new PermitFilter(
                parse(PermitType.class, type), parse(PermitReason.class, reason),
                parse(PayStatus.class, payStatus), parse(PermitStatus.class, status), from, to, search);
        PagedResult<Permit> result = useCase.search(CurrentUser.tenantId(auth), filter,
                Math.max(0, page), Math.min(Math.max(1, size), 200));
        return PageResponse.of(toResponses(result.content()), result.page(), result.size(), result.totalElements());
    }

    /** Reporte de incapacidades: faltas con motivo INCAPACIDAD, sin paginar (se exporta en el cliente). */
    @GetMapping("/incapacities")
    @PreAuthorize("hasAnyAuthority('permit:manage','permit:pay')")
    public List<PermitResponse> incapacities(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String payStatus,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            Authentication auth) {
        PermitFilter filter = new PermitFilter(PermitType.ABSENCE, PermitReason.INCAPACIDAD,
                parse(PayStatus.class, payStatus), parse(PermitStatus.class, status), from, to, search);
        return toResponses(useCase.report(CurrentUser.tenantId(auth), filter));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('permit:manage')")
    public PermitResponse create(@Valid @RequestBody CreatePermitRequest body, Authentication auth) {
        Permit p = useCase.create(new PermitUseCase.CreateCommand(
                CurrentUser.tenantId(auth), UUID.fromString(body.userId()), CurrentUser.userId(auth),
                parseRequired(PermitType.class, body.type(), "type"),
                parseRequired(PermitReason.class, body.reason(), "reason"),
                body.startDate(), body.endDate(), body.timeAt(), body.notes(),
                parse(PayStatus.class, body.payStatus()), hasAuthority(auth, PAY_AUTHORITY)));
        return toResponses(List.of(p)).get(0);
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('permit:manage')")
    public PermitResponse cancel(@PathVariable UUID id,
                                 @Valid @RequestBody(required = false) CancelPermitRequest body,
                                 Authentication auth) {
        Permit p = useCase.cancel(new PermitUseCase.CancelCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth), body == null ? null : body.note()));
        return toResponses(List.of(p)).get(0);
    }

    @PatchMapping("/{id}/pay")
    @PreAuthorize("hasAuthority('permit:pay')")
    public PermitResponse decidePay(@PathVariable UUID id,
                                    @Valid @RequestBody DecidePayRequest body,
                                    Authentication auth) {
        Permit p = useCase.decidePay(new PermitUseCase.DecidePayCommand(
                CurrentUser.tenantId(auth), id, CurrentUser.userId(auth),
                parseRequired(PayStatus.class, body.payStatus(), "payStatus"), body.note()));
        return toResponses(List.of(p)).get(0);
    }

    // ---- mapeo ----

    /** Enriquecer con nombres en un solo query (colaborador, quien otorgó, quien canceló, quien decidió goce). */
    private List<PermitResponse> toResponses(Collection<Permit> permits) {
        return toResponses(permits, directory);
    }

    static List<PermitResponse> toResponses(Collection<Permit> permits, EmployeeDirectoryQuery directory) {
        Set<UUID> ids = new HashSet<>();
        for (Permit p : permits) {
            ids.add(p.userId());
            if (p.grantedBy() != null) ids.add(p.grantedBy());
            if (p.cancelledBy() != null) ids.add(p.cancelledBy());
            if (p.payDecidedBy() != null) ids.add(p.payDecidedBy());
        }
        Map<UUID, EmployeeDirectoryQuery.Info> names = directory.byIds(ids);
        return permits.stream().map(p -> toResponse(p, names)).toList();
    }

    static PermitResponse toResponse(Permit p, Map<UUID, EmployeeDirectoryQuery.Info> names) {
        EmployeeDirectoryQuery.Info user = names.get(p.userId());
        return new PermitResponse(
                p.id().toString(), p.userId().toString(),
                user == null ? null : user.fullName(),
                user == null ? null : user.employeeCode(),
                p.type().name(), p.reason().name(), p.notes(),
                p.startDate(), p.endDate(), p.days(), p.timeAt(), p.status().name(),
                p.grantedBy() == null ? null : p.grantedBy().toString(),
                name(names, p.grantedBy()), name(names, p.cancelledBy()),
                p.cancelledAt(), p.cancelNote(),
                p.payStatus().name(), name(names, p.payDecidedBy()), p.payDecidedAt(), p.payNote(),
                p.createdAt());
    }

    private static String name(Map<UUID, EmployeeDirectoryQuery.Info> names, UUID id) {
        if (id == null) return null;
        EmployeeDirectoryQuery.Info i = names.get(id);
        return i == null ? null : i.fullName();
    }

    private static boolean hasAuthority(Authentication auth, String authority) {
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> Objects.equals(a.getAuthority(), authority));
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
