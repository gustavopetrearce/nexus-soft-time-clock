package com.condor.nexussoft.timeclock.onboarding.infrastructure.web;

import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportReport;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportRow;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportValidator;
import com.condor.nexussoft.timeclock.onboarding.domain.port.in.UserImportUseCase;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * Importación masiva de colaboradores (iteración 15). El portal lee el CSV/XLSX y envía las filas en
 * JSON: primero con {@code dryRun=true} para la vista previa y después con {@code dryRun=false} para
 * confirmar. El tenant es siempre el del token; el archivo no puede elegir empresa.
 *
 * <ul>
 *   <li>vista previa → 200 con los errores (si los hay);</li>
 *   <li>confirmación sin errores → 201 con los usuarios creados y sus contraseñas temporales;</li>
 *   <li>confirmación con errores → 422 con los errores; no se escribió nada.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/users/import")
@PreAuthorize("hasAuthority('user:manage')")
public class UserImportController {

    static final String SCHEDULE_MANAGE = "schedule:manage";

    private final UserImportUseCase imports;

    public UserImportController(UserImportUseCase imports) {
        this.imports = imports;
    }

    @PostMapping
    public ResponseEntity<ImportResponse> importUsers(@Valid @RequestBody ImportRequest request,
                                                      @RequestParam(defaultValue = "true") boolean dryRun,
                                                      Authentication authentication) {
        UserImportUseCase.Requester requester = new UserImportUseCase.Requester(
                granter((Jwt) authentication.getPrincipal()),
                authentication.getAuthorities().stream().anyMatch(a -> SCHEDULE_MANAGE.equals(a.getAuthority())));
        List<ImportRow> rows = request.rows().stream().map(ImportRowRequest::toDomain).toList();
        ImportReport report = imports.importUsers(TenantContext.require(), requester, rows, dryRun);

        HttpStatus status = dryRun ? HttpStatus.OK
                : report.valid() ? HttpStatus.CREATED : HttpStatus.UNPROCESSABLE_ENTITY;
        return ResponseEntity.status(status).body(ImportResponse.from(report));
    }

    /** Misma derivación que {@code GranterAuthorities} de Identity (claims {@code platform_admin} y {@code roles}). */
    private static GranterAuthority granter(Jwt jwt) {
        boolean platformAdmin = Boolean.TRUE.equals(jwt.getClaimAsBoolean("platform_admin"));
        List<String> roles = jwt.getClaimAsStringList("roles");
        return new GranterAuthority(platformAdmin, roles == null ? Set.of() : Set.copyOf(roles));
    }

    public record ImportRequest(
            @NotNull @Size(max = ImportValidator.MAX_ROWS) List<@NotNull ImportRowRequest> rows) {
    }

    /** Fila del archivo, con los nombres de campo en camelCase (el portal traduce los encabezados). */
    public record ImportRowRequest(
            int row,
            String email,
            String firstName,
            String lastName,
            String employeeCode,
            List<String> roles,
            String phone,
            String birthDate,
            String hireDate,
            String gender,
            String address,
            String emergencyContactName,
            String emergencyContactPhone,
            String scheduleCode,
            String shiftName,
            String workSiteCode,
            String shiftFrom,
            String shiftTo) {

        ImportRow toDomain() {
            return new ImportRow(row, email, firstName, lastName, employeeCode, roles, phone, birthDate,
                    hireDate, gender, address, emergencyContactName, emergencyContactPhone, scheduleCode,
                    shiftName, workSiteCode, shiftFrom, shiftTo);
        }
    }

    public record ImportResponse(
            boolean dryRun,
            boolean valid,
            int totalRows,
            int seatsNeeded,
            long seatsAvailable,
            List<IssueResponse> issues,
            List<ImportReport.ImportedUser> created) {

        static ImportResponse from(ImportReport r) {
            return new ImportResponse(r.dryRun(), r.valid(), r.totalRows(), r.seatsNeeded(), r.seatsAvailable(),
                    r.issues().stream().map(i -> new IssueResponse(i.row(), i.column(), i.code(), i.message()))
                            .toList(),
                    r.created());
        }
    }

    public record IssueResponse(int row, String column, String code, String message) {
    }
}
