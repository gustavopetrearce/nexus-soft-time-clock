package com.condor.nexussoft.timeclock.onboarding.application;

import com.condor.nexussoft.timeclock.hr.domain.port.in.EmployeeProfileUseCase;
import com.condor.nexussoft.timeclock.identity.domain.model.Email;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserCommands;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserManagementUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportCatalog;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportReport;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportRow;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportValidator;
import com.condor.nexussoft.timeclock.onboarding.domain.TemporaryPasswordGenerator;
import com.condor.nexussoft.timeclock.onboarding.domain.ValidatedRow;
import com.condor.nexussoft.timeclock.onboarding.domain.ValidationResult;
import com.condor.nexussoft.timeclock.onboarding.domain.port.in.UserImportUseCase;
import com.condor.nexussoft.timeclock.onboarding.domain.port.out.ImportCatalogPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanyCapacityUseCase;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Importación masiva de colaboradores (iteración 15). Valida el archivo entero contra una foto del
 * tenant y, si no hay un solo error, escribe todo en <b>una</b> transacción a través de los casos de
 * uso de cada contexto: Identity (cuenta, roles y cupo), HR (perfil) y Scheduling (turno). Si algo
 * falla a mitad —una alta simultánea con el mismo correo, el cupo agotado por otra sesión— la
 * excepción revierte todo el lote.
 */
@Service
public class UserImportService implements UserImportUseCase {

    /** Permiso que hace que un rol consuma un asiento del cupo (RN-35). */
    static final String SEAT_PERMISSION = "attendance:register";

    private final ImportCatalogPort catalog;
    private final UserManagementUseCase users;
    private final EmployeeProfileUseCase profiles;
    private final SchedulingUseCase scheduling;
    private final CompanyCapacityUseCase capacity;
    private final TemporaryPasswordGenerator passwords;
    private final Clock clock;

    @Autowired
    public UserImportService(ImportCatalogPort catalog, UserManagementUseCase users,
                             EmployeeProfileUseCase profiles, SchedulingUseCase scheduling,
                             CompanyCapacityUseCase capacity) {
        this(catalog, users, profiles, scheduling, capacity, new TemporaryPasswordGenerator(), Clock.systemUTC());
    }

    UserImportService(ImportCatalogPort catalog, UserManagementUseCase users, EmployeeProfileUseCase profiles,
                      SchedulingUseCase scheduling, CompanyCapacityUseCase capacity,
                      TemporaryPasswordGenerator passwords, Clock clock) {
        this.catalog = catalog;
        this.users = users;
        this.profiles = profiles;
        this.scheduling = scheduling;
        this.capacity = capacity;
        this.passwords = passwords;
        this.clock = clock;
    }

    @Override
    @Transactional
    public ImportReport importUsers(UUID tenantId, Requester requester, List<ImportRow> rows, boolean dryRun) {
        List<ImportRow> safeRows = rows == null ? List.of() : rows;
        long available = capacity.get(tenantId).available();
        ValidationResult result = ImportValidator.validate(safeRows, snapshot(tenantId, requester, safeRows, available));
        if (dryRun || !result.valid()) {
            return new ImportReport(dryRun, safeRows.size(), result.seatsNeeded(), available,
                    result.issues(), List.of());
        }
        List<ImportReport.ImportedUser> created = write(tenantId, requester, result.rows());
        return new ImportReport(false, safeRows.size(), result.seatsNeeded(), available, List.of(), created);
    }

    private List<ImportReport.ImportedUser> write(UUID tenantId, Requester requester, List<ValidatedRow> rows) {
        List<String> plain = rows.stream().map(r -> passwords.generate()).toList();
        List<UserCommands.CreateUserCommand> commands = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            ValidatedRow r = rows.get(i);
            commands.add(new UserCommands.CreateUserCommand(r.email(), r.firstName(), r.lastName(),
                    r.employeeCode(), plain.get(i), r.roles()));
        }
        List<UserView> views = users.createAll(tenantId, requester.granter(), commands);

        List<ImportReport.ImportedUser> created = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            ValidatedRow r = rows.get(i);
            UserView v = views.get(i);
            if (r.profile() != null) {
                ValidatedRow.Profile p = r.profile();
                profiles.upsert(new EmployeeProfileUseCase.UpsertProfileCommand(tenantId, v.id(),
                        p.birthDate(), p.hireDate(), p.gender(), p.phone(), p.address(),
                        p.emergencyContactName(), p.emergencyContactPhone()));
            }
            if (r.shift() != null) {
                ValidatedRow.Shift s = r.shift();
                scheduling.assignShift(tenantId, new SchedulingCommands.AssignShiftCommand(
                        v.id(), s.shiftId(), s.workSiteId(), s.validFrom(), s.validTo()));
            }
            created.add(new ImportReport.ImportedUser(r.row(), v.id(), v.email(), v.employeeCode(),
                    v.firstName(), v.lastName(), v.roles(), plain.get(i)));
        }
        return created;
    }

    private ImportCatalog snapshot(UUID tenantId, Requester requester, List<ImportRow> rows, long available) {
        List<String> emails = rows.stream().map(ImportRow::email).map(UserImportService::normalizedOrNull)
                .filter(Objects::nonNull).distinct().toList();
        List<String> codes = rows.stream().map(ImportRow::employeeCode).filter(Objects::nonNull)
                .map(String::strip).filter(c -> !c.isEmpty()).distinct().toList();
        boolean wantsShifts = rows.stream().anyMatch(UserImportService::hasShiftColumns);
        return new ImportCatalog(
                emails.isEmpty() ? Set.of() : catalog.existingEmails(tenantId, emails),
                codes.isEmpty() ? Set.of() : catalog.existingEmployeeCodes(tenantId, codes),
                catalog.systemRoleCodes(),
                catalog.rolesWithPermission(SEAT_PERMISSION),
                available,
                wantsShifts && requester.canAssignShifts() ? catalog.shifts(tenantId) : List.of(),
                wantsShifts && requester.canAssignShifts() ? catalog.activeWorkSites(tenantId) : Map.of(),
                requester.granter(),
                requester.canAssignShifts(),
                LocalDate.now(clock));
    }

    private static boolean hasShiftColumns(ImportRow r) {
        return notBlank(r.scheduleCode()) || notBlank(r.shiftName()) || notBlank(r.workSiteCode())
                || notBlank(r.shiftFrom()) || notBlank(r.shiftTo());
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String normalizedOrNull(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Email.of(raw).value();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
