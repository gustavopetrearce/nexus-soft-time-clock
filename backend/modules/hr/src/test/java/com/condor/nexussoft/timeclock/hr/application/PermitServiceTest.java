package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.PayStatus;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitReason;
import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.CancelCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.CreateCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.DecidePayCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.RequestIncapacityCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.PermitUseCase.ResolveCommand;
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

    // ---- solicitud de incapacidad del colaborador (V36) ----

    private RequestIncapacityCommand incapacity(LocalDate start, LocalDate end, String notes) {
        return new RequestIncapacityCommand(tenant, employee, start, end, notes);
    }

    @Test
    void incapacidad_sinObservaciones_esInvalida() {
        assertThatThrownBy(() -> service.requestIncapacity(incapacity(MON, MON, null)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.requestIncapacity(incapacity(MON, MON, "   ")))
                .isInstanceOf(IllegalArgumentException.class);
        verify(permits, never()).save(any());
    }

    @Test
    void incapacidad_nacePendiente_comoFaltaPorIncapacidad() {
        Permit p = service.requestIncapacity(incapacity(MON, MON.plusDays(2), " Gripe con fiebre, receta del IMSS "));

        assertThat(p.status()).isEqualTo(PermitStatus.PENDING);
        assertThat(p.type()).isEqualTo(PermitType.ABSENCE);
        assertThat(p.reason()).isEqualTo(PermitReason.INCAPACIDAD);
        assertThat(p.notes()).isEqualTo("Gripe con fiebre, receta del IMSS");
        assertThat(p.requestedBy()).isEqualTo(employee);
        assertThat(p.grantedBy()).isNull();
        assertThat(p.payStatus()).isEqualTo(PayStatus.PENDING_REVIEW);
        assertThat(p.days()).isEqualTo(3);
    }

    @Test
    void incapacidad_traslapadaConOtraFaltaOSolicitud_esConflicto() {
        when(permits.overlapsApprovedOrPending(tenant, employee, PermitType.ABSENCE, MON, MON)).thenReturn(true);

        assertThatThrownBy(() -> service.requestIncapacity(incapacity(MON, MON, "cirugía")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aprobarSolicitud_quienApruebaQuedaComoOtorgante() {
        Permit pending = service.requestIncapacity(incapacity(MON, MON, "cirugía"));
        when(permits.find(tenant, pending.id())).thenReturn(Optional.of(pending));

        Permit approved = service.resolve(new ResolveCommand(tenant, pending.id(), supervisor, true, " ok "));

        assertThat(approved.status()).isEqualTo(PermitStatus.APPROVED);
        assertThat(approved.grantedBy()).isEqualTo(supervisor);
        assertThat(approved.resolvedBy()).isEqualTo(supervisor);
        assertThat(approved.resolutionNote()).isEqualTo("ok");
        assertThat(approved.resolvedAt()).isNotNull();
    }

    @Test
    void rechazarSolicitud_noSePuedeVolverAResolverNiCancelarNiDecidirGoce() {
        Permit pending = service.requestIncapacity(incapacity(MON, MON, "cirugía"));
        Permit rejected = pending.resolve(false, supervisor, "sin comprobante", OffsetDateTime.now());
        when(permits.find(tenant, rejected.id())).thenReturn(Optional.of(rejected));

        assertThat(rejected.status()).isEqualTo(PermitStatus.REJECTED);
        assertThat(rejected.grantedBy()).isNull();
        assertThatThrownBy(() -> service.resolve(new ResolveCommand(tenant, rejected.id(), supervisor, true, null)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.cancel(new CancelCommand(tenant, rejected.id(), supervisor, null)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.decidePay(new DecidePayCommand(tenant, rejected.id(), hr, PayStatus.WITH_PAY, null)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aprobarSolicitud_queSeTraslapaConUnPermisoAprobado_esConflicto() {
        Permit pending = service.requestIncapacity(incapacity(MON, MON, "cirugía"));
        when(permits.find(tenant, pending.id())).thenReturn(Optional.of(pending));
        when(permits.overlaps(tenant, employee, PermitType.ABSENCE, MON, MON)).thenReturn(true);

        assertThatThrownBy(() -> service.resolve(new ResolveCommand(tenant, pending.id(), supervisor, true, null)))
                .isInstanceOf(IllegalStateException.class);
    }
}
