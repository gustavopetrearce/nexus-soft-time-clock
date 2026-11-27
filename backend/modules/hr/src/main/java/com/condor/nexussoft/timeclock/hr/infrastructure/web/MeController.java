package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import com.condor.nexussoft.timeclock.hr.domain.ContractStatus;
import com.condor.nexussoft.timeclock.hr.domain.ContractView;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.EmployeeProfile;
import com.condor.nexussoft.timeclock.hr.domain.VacationPolicy;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.in.EmployeeProfileUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationPolicyUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase;
import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.EmployeeDirectoryQuery;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.MeDtos.MeContractResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.MeDtos.MeProfileResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.MeDtos.MeVacationSummaryResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PermitDtos.PermitResponse;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.PermitDtos.RequestIncapacityRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import com.condor.nexussoft.timeclock.hr.infrastructure.web.dto.VacationDtos.VacationRequestResponse;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vista propia del colaborador (app móvil): su perfil (solo lectura), su resumen de
 * vacaciones por antigüedad y sus solicitudes. Solo requiere estar autenticado; cada quien
 * ve únicamente sus propios datos (derivados del token).
 *
 * NOTA: si tus controllers usan un context-path, elimina el prefijo "/api/v1".
 */
@RestController
@RequestMapping("/api/v1/me")
@PreAuthorize("isAuthenticated()")
public class MeController {

    private final EmployeeProfileUseCase profiles;
    private final VacationPolicyUseCase policies;
    private final VacationRequestUseCase requests;
    private final PermitUseCase permits;
    private final ContractUseCase contracts;
    private final EmployeeDirectoryQuery directory;

    public MeController(EmployeeProfileUseCase profiles, VacationPolicyUseCase policies,
                        VacationRequestUseCase requests, PermitUseCase permits,
                        ContractUseCase contracts, EmployeeDirectoryQuery directory) {
        this.contracts = contracts;
        this.profiles = profiles;
        this.policies = policies;
        this.requests = requests;
        this.permits = permits;
        this.directory = directory;
    }

    @GetMapping("/profile")
    public MeProfileResponse profile(Authentication auth) {
        UUID tenantId = CurrentUser.tenantId(auth);
        UUID userId = CurrentUser.userId(auth);
        EmployeeProfile p = profiles.get(tenantId, userId);
        EmployeeDirectoryQuery.Info info = directory.byIds(tenantId, List.of(userId)).get(userId);
        return new MeProfileResponse(
                userId.toString(),
                info == null ? null : info.fullName(),
                info == null ? null : info.email(),
                info == null ? null : info.employeeCode(),
                p.birthDate(), p.hireDate(),
                p.gender() == null ? null : p.gender().name(),
                p.phone(), p.address(), p.emergencyContactName(), p.emergencyContactPhone());
    }

    @GetMapping("/vacations/summary")
    public MeVacationSummaryResponse vacationSummary(Authentication auth) {
        UUID tenantId = CurrentUser.tenantId(auth);
        UUID userId = CurrentUser.userId(auth);
        EmployeeProfile p = profiles.get(tenantId, userId);
        int years = p.hireDate() == null ? 0 : completedYears(p.hireDate(), LocalDate.now());
        VacationPolicy policy = policies.get(tenantId);
        int entitled = policy.entitlement(years);

        int currentYear = LocalDate.now().getYear();
        int taken = 0;
        int pending = 0;
        for (VacationRequest r : requests.listForUser(tenantId, userId)) {
            if (r.status() == VacationStatus.APPROVED && r.startDate() != null && r.startDate().getYear() == currentYear) {
                taken += r.days();
            } else if (r.status() == VacationStatus.PENDING) {
                pending += r.days();
            }
        }
        int available = Math.max(0, entitled - taken);
        return new MeVacationSummaryResponse(years, entitled, taken, pending, available);
    }

    @GetMapping("/vacations")
    public List<VacationRequestResponse> vacations(Authentication auth) {
        UUID tenantId = CurrentUser.tenantId(auth);
        UUID userId = CurrentUser.userId(auth);
        EmployeeDirectoryQuery.Info info = directory.byIds(tenantId, List.of(userId)).get(userId);
        return requests.listForUser(tenantId, userId).stream().map(r -> new VacationRequestResponse(
                r.id().toString(), r.userId().toString(),
                info == null ? null : info.fullName(),
                info == null ? null : info.employeeCode(),
                r.startDate(), r.endDate(), r.days(), r.reason(), r.status().name(),
                r.resolutionNote(), r.resolvedBy() == null ? null : r.resolvedBy().toString(),
                r.resolvedAt(), r.createdAt())).toList();
    }

    /** Permisos propios (entradas tarde, salidas temprano, faltas), con su goce de sueldo. */
    @GetMapping("/permits")
    public List<PermitResponse> permits(Authentication auth) {
        return PermitController.toResponses(
                permits.listForUser(CurrentUser.tenantId(auth), CurrentUser.userId(auth)), directory);
    }

    /**
     * Solicitud de incapacidad del propio colaborador: nace PENDING y la resuelve quien tiene
     * {@code permit:manage}. Las observaciones con el motivo exacto son obligatorias.
     */
    @PostMapping("/permits/incapacity")
    @ResponseStatus(HttpStatus.CREATED)
    public PermitResponse requestIncapacity(@Valid @RequestBody RequestIncapacityRequest body, Authentication auth) {
        UUID tenantId = CurrentUser.tenantId(auth);
        return PermitController.toResponses(List.of(permits.requestIncapacity(new PermitUseCase.RequestIncapacityCommand(
                tenantId, CurrentUser.userId(auth), body.startDate(), body.endDate(), body.notes()))), directory).get(0);
    }

    /**
     * Contrato propio (iteración 14): el que cubre hoy o, si no hay, el próximo por empezar. Sin
     * ninguno responde 204: la app muestra "sin contrato registrado".
     */
    @GetMapping("/contract")
    public ResponseEntity<MeContractResponse> contract(Authentication auth) {
        LocalDate today = LocalDate.now();
        List<ContractView> mine = contracts.listForUser(CurrentUser.tenantId(auth), CurrentUser.userId(auth))
                .stream().filter(v -> v.contract().status() != ContractStatus.CANCELLED).toList();
        return mine.stream().filter(v -> v.contract().covers(today)).findFirst()
                .or(() -> mine.stream().filter(v -> v.contract().startsOn().isAfter(today))
                        .min(Comparator.comparing(v -> v.contract().startsOn())))
                .map(v -> ResponseEntity.ok(toContract(v, today)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    private static MeContractResponse toContract(ContractView v, LocalDate today) {
        EmploymentContract c = v.contract();
        return new MeContractResponse(c.type().name(),
                v.project() == null ? null : v.project().code(),
                v.project() == null ? null : v.project().name(),
                c.startsOn(), c.endsOn(), c.covers(today));
    }

    private static int completedYears(LocalDate from, LocalDate to) {
        int years = to.getYear() - from.getYear();
        if (to.getMonthValue() < from.getMonthValue()
                || (to.getMonthValue() == from.getMonthValue() && to.getDayOfMonth() < from.getDayOfMonth())) {
            years--;
        }
        return Math.max(0, years);
    }
}
