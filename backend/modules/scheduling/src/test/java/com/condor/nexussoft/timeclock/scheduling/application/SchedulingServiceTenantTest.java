package com.condor.nexussoft.timeclock.scheduling.application;

import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands.AssignShiftCommand;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ScheduleRepositoryPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ShiftAssignmentRepositoryPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.ShiftRepositoryPort;
import com.condor.nexussoft.timeclock.scheduling.domain.port.out.TenantDirectoryPort;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** No se asignan turnos a colaboradores ni centros de otra empresa. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SchedulingServiceTenantTest {

    @Mock private ScheduleRepositoryPort schedules;
    @Mock private ShiftRepositoryPort shifts;
    @Mock private ShiftAssignmentRepositoryPort assignments;
    @Mock private TenantDirectoryPort directory;

    private SchedulingService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID shiftId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID siteId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new SchedulingService(schedules, shifts, assignments, directory);
        when(shifts.findByIdAndTenant(shiftId, tenant)).thenReturn(Optional.of(mock(Shift.class)));
        when(directory.isTenantUser(tenant, userId)).thenReturn(true);
        when(directory.isTenantWorkSite(tenant, siteId)).thenReturn(true);
    }

    private AssignShiftCommand command() {
        return new AssignShiftCommand(userId, shiftId, siteId, LocalDate.of(2026, 12, 1), null);
    }

    @Test
    void colaboradorDeOtroTenant_noSeEncuentra() {
        when(directory.isTenantUser(tenant, userId)).thenReturn(false);

        assertThatThrownBy(() -> service.assignShift(tenant, command())).isInstanceOf(ResourceNotFoundException.class);
        verify(assignments, never()).save(any());
    }

    @Test
    void centroDeOtroTenant_noSeEncuentra() {
        when(directory.isTenantWorkSite(tenant, siteId)).thenReturn(false);

        assertThatThrownBy(() -> service.assignShift(tenant, command())).isInstanceOf(ResourceNotFoundException.class);
        verify(assignments, never()).save(any());
    }
}
