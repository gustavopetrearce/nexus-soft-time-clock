package com.condor.nexussoft.timeclock.onboarding.application;

import com.condor.nexussoft.timeclock.hr.domain.port.in.EmployeeProfileUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserCommands;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserManagementUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportReport;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportRow;
import com.condor.nexussoft.timeclock.onboarding.domain.ShiftRef;
import com.condor.nexussoft.timeclock.onboarding.domain.TemporaryPasswordGenerator;
import com.condor.nexussoft.timeclock.onboarding.domain.port.in.UserImportUseCase;
import com.condor.nexussoft.timeclock.onboarding.domain.port.out.ImportCatalogPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import com.condor.nexussoft.timeclock.tenancy.domain.CapacityStatus;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanyCapacityUseCase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserImportServiceTest {

    @Mock ImportCatalogPort catalog;
    @Mock UserManagementUseCase users;
    @Mock EmployeeProfileUseCase profiles;
    @Mock SchedulingUseCase scheduling;
    @Mock CompanyCapacityUseCase capacity;

    final UUID tenantId = UUID.randomUUID();
    final UUID shiftId = UUID.randomUUID();
    final UserImportUseCase.Requester admin = new UserImportUseCase.Requester(
            new GranterAuthority(false, Set.of("COMPANY_ADMIN")), true);

    UserImportService service;

    @BeforeEach
    void setUp() {
        service = new UserImportService(catalog, users, profiles, scheduling, capacity,
                new TemporaryPasswordGenerator(), Clock.fixed(Instant.parse("2026-11-26T12:00:00Z"), ZoneOffset.UTC));
        when(capacity.get(tenantId)).thenReturn(new CapacityStatus(tenantId, 150, 50, 0, 150, 10, 140));
        when(catalog.existingEmails(any(), any())).thenReturn(Set.of());
        when(catalog.existingEmployeeCodes(any(), any())).thenReturn(Set.of());
        when(catalog.systemRoleCodes()).thenReturn(Set.of("COMPANY_ADMIN", "HR_ADMIN", "SUPERVISOR", "AUDITOR", "EMPLOYEE"));
        when(catalog.rolesWithPermission(UserImportService.SEAT_PERMISSION)).thenReturn(Set.of("EMPLOYEE"));
        when(catalog.shifts(tenantId)).thenReturn(List.of(new ShiftRef("HOR-01", "Matutino", shiftId)));
        when(catalog.activeWorkSites(tenantId)).thenReturn(Map.of());
    }

    ImportRow fullRow() {
        return new ImportRow(2, "ana@demo.com", "Ana", "Pérez", "E-1", List.of("EMPLOYEE"), "555", null,
                "2026-01-10", "F", null, null, null, "HOR-01", "Matutino", null, "2026-12-01", null);
    }

    ImportRow plainRow(int n, String email) {
        return new ImportRow(n, email, "Luis", "Gómez", null, List.of("AUDITOR"), null, null, null, null, null,
                null, null, null, null, null, null, null);
    }

    @Test
    void dryRun_validaSinEscribir() {
        ImportReport report = service.importUsers(tenantId, admin, List.of(fullRow()), true);

        assertThat(report.valid()).isTrue();
        assertThat(report.dryRun()).isTrue();
        assertThat(report.seatsNeeded()).isEqualTo(1);
        assertThat(report.seatsAvailable()).isEqualTo(140);
        assertThat(report.created()).isEmpty();
        verifyNoInteractions(users, profiles, scheduling);
    }

    @Test
    @SuppressWarnings("unchecked")
    void confirmar_creaUsuarioPerfilYTurno() {
        UUID userId = UUID.randomUUID();
        when(users.createAll(eq(tenantId), any(), anyList())).thenAnswer(inv -> {
            List<UserCommands.CreateUserCommand> cmds = inv.getArgument(2);
            return cmds.stream().map(c -> new UserView(userId, c.email(), c.firstName(), c.lastName(),
                    c.employeeCode(), "ACTIVE", List.copyOf(c.roleCodes()))).toList();
        });

        ImportReport report = service.importUsers(tenantId, admin, List.of(fullRow(), plainRow(3, "luis@demo.com")), false);

        assertThat(report.valid()).isTrue();
        assertThat(report.created()).hasSize(2);
        ArgumentCaptor<List<UserCommands.CreateUserCommand>> cmds = ArgumentCaptor.forClass(List.class);
        verify(users).createAll(eq(tenantId), eq(admin.granter()), cmds.capture());
        assertThat(cmds.getValue()).extracting(UserCommands.CreateUserCommand::password)
                .containsExactlyElementsOf(report.created().stream().map(ImportReport.ImportedUser::temporaryPassword).toList());

        // Solo la primera fila trae perfil y turno.
        verify(profiles).upsert(any());
        ArgumentCaptor<SchedulingCommands.AssignShiftCommand> shift =
                ArgumentCaptor.forClass(SchedulingCommands.AssignShiftCommand.class);
        verify(scheduling).assignShift(eq(tenantId), shift.capture());
        assertThat(shift.getValue().shiftId()).isEqualTo(shiftId);
        assertThat(shift.getValue().userId()).isEqualTo(userId);
    }

    @Test
    void confirmarConErrores_noEscribeNada() {
        ImportReport report = service.importUsers(tenantId, admin,
                List.of(plainRow(2, "dup@demo.com"), plainRow(3, "dup@demo.com")), false);

        assertThat(report.valid()).isFalse();
        assertThat(report.issues()).extracting(i -> i.code()).containsExactly("DUPLICATE_IN_FILE");
        verify(users, never()).createAll(any(), any(), anyList());
        verifyNoInteractions(profiles, scheduling);
    }

    @Test
    void sinColumnasDeTurno_noConsultaHorarios() {
        service.importUsers(tenantId, admin, List.of(plainRow(2, "a@demo.com")), true);

        verify(catalog, never()).shifts(any());
        verify(catalog, never()).activeWorkSites(any());
    }
}
