package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.port.in.EmployeeProfileUseCase.UpsertProfileCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase.CreateCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.out.EmployeeProfileRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationPolicyRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationRequestRepositoryPort;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Vacaciones y perfiles no aceptan colaboradores de otra empresa (aislamiento multi-tenant). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TenantIsolationTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 16);

    @Mock private VacationRequestRepositoryPort requests;
    @Mock private VacationPolicyRepositoryPort policies;
    @Mock private EmployeeProfileRepositoryPort profiles;

    private final UUID tenant = UUID.randomUUID();
    private final UUID ownEmployee = UUID.randomUUID();
    private final UUID foreignEmployee = UUID.randomUUID();

    @Test
    void vacaciones_paraColaboradorDeOtroTenant_noSeEncuentra() {
        when(requests.isTenantUser(tenant, foreignEmployee)).thenReturn(false);
        VacationRequestService service = new VacationRequestService(requests, policies);

        assertThatThrownBy(() -> service.create(new CreateCommand(tenant, foreignEmployee, MON, MON, null)))
                .isInstanceOf(NoSuchElementException.class);
        verify(requests, never()).save(any());
    }

    @Test
    void vacaciones_paraColaboradorPropio_seCrean() {
        when(requests.isTenantUser(tenant, ownEmployee)).thenReturn(true);
        when(policies.findByTenant(tenant)).thenReturn(Optional.empty());
        when(requests.save(any())).thenAnswer(inv -> inv.getArgument(0));
        VacationRequestService service = new VacationRequestService(requests, policies);

        VacationRequest r = service.create(new CreateCommand(tenant, ownEmployee, MON, MON, null));

        assertThat(r.tenantId()).isEqualTo(tenant);
        assertThat(r.userId()).isEqualTo(ownEmployee);
    }

    @Test
    void perfil_deColaboradorDeOtroTenant_noSeEdita() {
        when(profiles.isTenantUser(tenant, foreignEmployee)).thenReturn(false);
        EmployeeProfileService service = new EmployeeProfileService(profiles);

        assertThatThrownBy(() -> service.upsert(new UpsertProfileCommand(
                tenant, foreignEmployee, null, MON, null, null, null, null, null)))
                .isInstanceOf(NoSuchElementException.class);
        verify(profiles, never()).save(any());
    }
}
