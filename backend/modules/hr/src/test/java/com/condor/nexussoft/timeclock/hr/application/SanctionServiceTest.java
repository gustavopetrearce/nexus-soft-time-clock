package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.Sanction;
import com.condor.nexussoft.timeclock.hr.domain.SanctionReason;
import com.condor.nexussoft.timeclock.hr.domain.SanctionStatus;
import com.condor.nexussoft.timeclock.hr.domain.SanctionType;
import com.condor.nexussoft.timeclock.hr.domain.port.in.SanctionUseCase.CreateCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.SanctionUseCase.VoidCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.out.SanctionRepositoryPort;
import org.junit.jupiter.api.BeforeEach;
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

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SanctionServiceTest {

    private static final LocalDate DAY = LocalDate.of(2026, 11, 20);

    @Mock
    private SanctionRepositoryPort sanctions;

    private SanctionService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID employee = UUID.randomUUID();
    private final UUID hr = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new SanctionService(sanctions);
        when(sanctions.isCollaborator(tenant, employee)).thenReturn(true);
        when(sanctions.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private CreateCommand cmd(SanctionType type, String description, LocalDate start, Integer days) {
        return new CreateCommand(tenant, employee, hr, type, SanctionReason.TARDINESS, DAY, description, start, days);
    }

    @Test
    void amonestacion_naceVigente_ySinDatosDeSuspension() {
        Sanction s = service.create(cmd(SanctionType.WRITTEN_WARNING, "  Tres retardos en la semana ", DAY, 3));

        assertThat(s.status()).isEqualTo(SanctionStatus.ACTIVE);
        assertThat(s.description()).isEqualTo("Tres retardos en la semana");
        assertThat(s.suspensionStart()).isNull();
        assertThat(s.suspensionDays()).isNull();
        assertThat(s.issuedBy()).isEqualTo(hr);
    }

    @Test
    void descripcionObligatoria() {
        assertThatThrownBy(() -> service.create(cmd(SanctionType.VERBAL_WARNING, "  ", null, null)))
                .isInstanceOf(IllegalArgumentException.class);
        verify(sanctions, never()).save(any());
    }

    @Test
    void suspension_exigeInicioYDias_yCalculaElFin() {
        assertThatThrownBy(() -> service.create(cmd(SanctionType.SUSPENSION, "Falta grave", null, 3)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.create(cmd(SanctionType.SUSPENSION, "Falta grave", DAY, 0)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.create(cmd(SanctionType.SUSPENSION, "Falta grave", DAY.minusDays(1), 2)))
                .isInstanceOf(IllegalArgumentException.class);

        Sanction s = service.create(cmd(SanctionType.SUSPENSION, "Falta grave", DAY.plusDays(3), 3));
        assertThat(s.suspensionEnd()).isEqualTo(DAY.plusDays(5));
    }

    @Test
    void colaboradorDeOtroTenant_noSeEncuentra() {
        when(sanctions.isCollaborator(tenant, employee)).thenReturn(false);
        assertThatThrownBy(() -> service.create(cmd(SanctionType.VERBAL_WARNING, "x", null, null)))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void anular_exigeMotivo_yEsDefinitivo() {
        Sanction s = service.create(cmd(SanctionType.VERBAL_WARNING, "x", null, null));
        when(sanctions.find(tenant, s.id())).thenReturn(Optional.of(s));

        assertThatThrownBy(() -> service.voidSanction(new VoidCommand(tenant, s.id(), hr, " ")))
                .isInstanceOf(IllegalArgumentException.class);

        Sanction v = service.voidSanction(new VoidCommand(tenant, s.id(), hr, "Se aclaró el retardo"));
        assertThat(v.status()).isEqualTo(SanctionStatus.VOIDED);
        assertThat(v.voidReason()).isEqualTo("Se aclaró el retardo");
        assertThat(v.voidedBy()).isEqualTo(hr);

        when(sanctions.find(tenant, s.id())).thenReturn(Optional.of(v));
        assertThatThrownBy(() -> service.voidSanction(new VoidCommand(tenant, s.id(), hr, "otra vez")))
                .isInstanceOf(IllegalStateException.class);
    }
}
