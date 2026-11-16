package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.PayStatus;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitReason;
import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.CancelCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.CreateCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.DecidePayCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.out.PermitRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationPolicyRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
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
class PermitServiceTest {

    /** Lunes. */
    private static final LocalDate MON = LocalDate.of(2026, 11, 16);

    @Mock
    private PermitRepositoryPort permits;
    @Mock
    private VacationPolicyRepositoryPort policies;

    private PermitService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID employee = UUID.randomUUID();
    private final UUID supervisor = UUID.randomUUID();
    private final UUID hr = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new PermitService(permits, policies);
        when(permits.isCollaborator(tenant, employee)).thenReturn(true);
        when(policies.findByTenant(tenant)).thenReturn(Optional.empty());   // defaults: solo hábiles
        when(permits.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private CreateCommand create(PermitType type, LocalDate start, LocalDate end, LocalTime time,
                                 PayStatus pay, boolean canPay) {
        return new CreateCommand(tenant, employee, supervisor, type, PermitReason.PERSONAL,
                start, end, time, "  ", pay, canPay);
    }

    @Test
    void falta_naceAprobadaPendienteDeGoce_yCuentaDiasHabiles() {
        // lunes → domingo: 5 días hábiles con la política por defecto.
        Permit p = service.create(create(PermitType.ABSENCE, MON, MON.plusDays(6), null, null, false));

        assertThat(p.status()).isEqualTo(PermitStatus.APPROVED);
        assertThat(p.payStatus()).isEqualTo(PayStatus.PENDING_REVIEW);
        assertThat(p.payDecidedBy()).isNull();
        assertThat(p.days()).isEqualTo(5);
        assertThat(p.grantedBy()).isEqualTo(supervisor);
        assertThat(p.notes()).isNull();
    }

    @Test
    void entradaTarde_esDeUnDia_yRequiereHora() {
        assertThatThrownBy(() -> service.create(create(PermitType.LATE_ARRIVAL, MON, MON, null, null, false)))
                .isInstanceOf(IllegalArgumentException.class);

        Permit p = service.create(create(PermitType.LATE_ARRIVAL, MON, MON.plusDays(3), LocalTime.of(10, 0), null, false));
        assertThat(p.endDate()).isEqualTo(MON);
        assertThat(p.days()).isEqualTo(1);
        assertThat(p.timeAt()).isEqualTo(LocalTime.of(10, 0));
    }

    @Test
    void falta_noLlevaHora() {
        assertThatThrownBy(() -> service.create(create(PermitType.ABSENCE, MON, MON, LocalTime.NOON, null, false)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void periodoInvertido_esInvalido() {
        assertThatThrownBy(() -> service.create(create(PermitType.ABSENCE, MON, MON.minusDays(1), null, null, false)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void traslapeDelMismoTipo_esConflicto() {
        when(permits.overlaps(tenant, employee, PermitType.ABSENCE, MON, MON)).thenReturn(true);

        assertThatThrownBy(() -> service.create(create(PermitType.ABSENCE, MON, MON, null, null, false)))
                .isInstanceOf(IllegalStateException.class);
        verify(permits, never()).save(any());
    }

    @Test
    void colaboradorDeOtroTenant_noSeEncuentra() {
        when(permits.isCollaborator(tenant, employee)).thenReturn(false);

        assertThatThrownBy(() -> service.create(create(PermitType.ABSENCE, MON, MON, null, null, false)))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void goceEnElAlta_soloConPermitPay() {
        assertThatThrownBy(() -> service.create(create(PermitType.ABSENCE, MON, MON, null, PayStatus.WITH_PAY, false)))
                .isInstanceOf(AuthorizationException.class);

        Permit p = service.create(create(PermitType.ABSENCE, MON, MON, null, PayStatus.WITH_PAY, true));
        assertThat(p.payStatus()).isEqualTo(PayStatus.WITH_PAY);
        assertThat(p.payDecidedBy()).isEqualTo(supervisor);
        assertThat(p.payDecidedAt()).isNotNull();
    }

    @Test
    void rrhhDecideGoce_sobreUnPermisoQueAproboOtro() {
        Permit existing = service.create(create(PermitType.ABSENCE, MON, MON, null, null, false));
        when(permits.find(tenant, existing.id())).thenReturn(Optional.of(existing));

        Permit decided = service.decidePay(new DecidePayCommand(tenant, existing.id(), hr, PayStatus.WITHOUT_PAY, " sin justificante "));

        assertThat(decided.payStatus()).isEqualTo(PayStatus.WITHOUT_PAY);
        assertThat(decided.payDecidedBy()).isEqualTo(hr);
        assertThat(decided.payNote()).isEqualTo("sin justificante");
        assertThat(decided.grantedBy()).isEqualTo(supervisor);
        assertThat(decided.status()).isEqualTo(PermitStatus.APPROVED);
    }

    @Test
    void decidirGoce_pendienteNoEsUnaDecision() {
        assertThatThrownBy(() -> service.decidePay(new DecidePayCommand(tenant, UUID.randomUUID(), hr, PayStatus.PENDING_REVIEW, null)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void permisoCancelado_noSeCancelaNiSeDecideGoce() {
        Permit cancelled = service.create(create(PermitType.ABSENCE, MON, MON, null, null, false))
                .cancel(supervisor, "error", OffsetDateTime.now());
        when(permits.find(tenant, cancelled.id())).thenReturn(Optional.of(cancelled));

        assertThatThrownBy(() -> service.cancel(new CancelCommand(tenant, cancelled.id(), supervisor, null)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.decidePay(new DecidePayCommand(tenant, cancelled.id(), hr, PayStatus.WITH_PAY, null)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void cancelar_guardaQuienYPorque() {
        Permit p = service.create(create(PermitType.EARLY_DEPARTURE, MON, MON, LocalTime.of(15, 0), null, false));
        when(permits.find(tenant, p.id())).thenReturn(Optional.of(p));

        Permit c = service.cancel(new CancelCommand(tenant, p.id(), supervisor, "ya no aplica"));

        assertThat(c.status()).isEqualTo(PermitStatus.CANCELLED);
        assertThat(c.cancelledBy()).isEqualTo(supervisor);
        assertThat(c.cancelNote()).isEqualTo("ya no aplica");
        assertThat(c.cancelledAt()).isNotNull();
    }
}
