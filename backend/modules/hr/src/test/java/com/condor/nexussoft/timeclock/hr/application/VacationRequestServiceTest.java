package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest.CancellationStatus;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase.RequestCancellationCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase.ResolveCancellationCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.VacationRequestUseCase.ResolveCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationPolicyRepositoryPort;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationRequestRepositoryPort;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Cancelación de vacaciones a petición del colaborador (V37). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class VacationRequestServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    @Mock
    private VacationRequestRepositoryPort requests;
    @Mock
    private VacationPolicyRepositoryPort policies;

    private VacationRequestService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID employee = UUID.randomUUID();
    private final UUID hr = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(TODAY.atStartOfDay(ZoneOffset.UTC).plusHours(12).toInstant(), ZoneId.of("UTC"));
        service = new VacationRequestService(requests, policies, clock);
        when(requests.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private VacationRequest stored(VacationStatus status, LocalDate start) {
        VacationRequest r = new VacationRequest(UUID.randomUUID(), tenant, employee, start, start.plusDays(4), 5,
                null, status, null, null, null, null, null, null, null, null, null, OffsetDateTime.now());
        when(requests.find(tenant, r.id())).thenReturn(Optional.of(r));
        return r;
    }

    private VacationRequest askCancel(VacationRequest r) {
        VacationRequest c = service.requestCancellation(
                new RequestCancellationCommand(tenant, r.id(), employee, " reagendar a enero "));
        when(requests.find(tenant, r.id())).thenReturn(Optional.of(c));
        return c;
    }

    @Test
    void pedirCancelacion_dePendiente_conservaElEstadoYGuardaElMotivo() {
        VacationRequest c = askCancel(stored(VacationStatus.PENDING, TODAY.plusDays(10)));

        assertThat(c.status()).isEqualTo(VacationStatus.PENDING);
        assertThat(c.cancelRequestStatus()).isEqualTo(CancellationStatus.PENDING);
        assertThat(c.cancelRequestReason()).isEqualTo("reagendar a enero");
        assertThat(c.cancelRequestedAt()).isNotNull();
    }

    @Test
    void pedirCancelacion_exigeMotivo() {
        VacationRequest r = stored(VacationStatus.PENDING, TODAY.plusDays(10));

        assertThatThrownBy(() -> service.requestCancellation(new RequestCancellationCommand(tenant, r.id(), employee, "  ")))
                .isInstanceOf(IllegalArgumentException.class);
        verify(requests, never()).save(any());
    }

    @Test
    void pedirCancelacion_soloElDueno() {
        VacationRequest r = stored(VacationStatus.PENDING, TODAY.plusDays(10));

        assertThatThrownBy(() -> service.requestCancellation(new RequestCancellationCommand(tenant, r.id(), hr, "x")))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void pedirCancelacion_deAprobadaQueYaEmpezo_noSePuede() {
        VacationRequest started = stored(VacationStatus.APPROVED, TODAY);
        assertThatThrownBy(() -> service.requestCancellation(new RequestCancellationCommand(tenant, started.id(), employee, "x")))
                .isInstanceOf(IllegalStateException.class);

        VacationRequest rejected = stored(VacationStatus.REJECTED, TODAY.plusDays(5));
        assertThatThrownBy(() -> service.requestCancellation(new RequestCancellationCommand(tenant, rejected.id(), employee, "x")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void pedirCancelacion_dosVeces_esConflicto() {
        VacationRequest c = askCancel(stored(VacationStatus.PENDING, TODAY.plusDays(10)));

        assertThatThrownBy(() -> service.requestCancellation(new RequestCancellationCommand(tenant, c.id(), employee, "otra")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aceptarCancelacion_deAprobadaFutura_laCancela() {
        VacationRequest c = askCancel(stored(VacationStatus.APPROVED, TODAY.plusDays(1)));

        VacationRequest done = service.resolveCancellation(new ResolveCancellationCommand(tenant, c.id(), hr, true, " ok "));

        assertThat(done.status()).isEqualTo(VacationStatus.CANCELLED);
        assertThat(done.cancelRequestStatus()).isEqualTo(CancellationStatus.ACCEPTED);
        assertThat(done.cancelResolvedBy()).isEqualTo(hr);
        assertThat(done.cancelResolutionNote()).isEqualTo("ok");
    }

    @Test
    void denegarCancelacion_dejaLasVacacionesComoEstaban() {
        VacationRequest c = askCancel(stored(VacationStatus.APPROVED, TODAY.plusDays(3)));

        VacationRequest done = service.resolveCancellation(new ResolveCancellationCommand(tenant, c.id(), hr, false, "temporada alta"));

        assertThat(done.status()).isEqualTo(VacationStatus.APPROVED);
        assertThat(done.cancelRequestStatus()).isEqualTo(CancellationStatus.DENIED);
        // Puede volver a pedirla.
        when(requests.find(tenant, c.id())).thenReturn(Optional.of(done));
        assertThat(askCancel(done).cancelRequestStatus()).isEqualTo(CancellationStatus.PENDING);
    }

    @Test
    void resolverCancelacion_sinSolicitud_esConflicto() {
        VacationRequest r = stored(VacationStatus.PENDING, TODAY.plusDays(10));

        assertThatThrownBy(() -> service.resolveCancellation(new ResolveCancellationCommand(tenant, r.id(), hr, true, null)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rechazarPendienteConCancelacionEnCurso_laDeniega_yQuedaComoNegativaDeLaEmpresa() {
        VacationRequest c = askCancel(stored(VacationStatus.PENDING, TODAY.plusDays(10)));

        VacationRequest done = service.resolve(new ResolveCommand(tenant, c.id(), hr, false, "sin cobertura"));

        assertThat(done.status()).isEqualTo(VacationStatus.REJECTED);
        assertThat(done.resolutionNote()).isEqualTo("sin cobertura");
        assertThat(done.cancelRequestStatus()).isEqualTo(CancellationStatus.DENIED);
        assertThat(done.cancelResolvedBy()).isEqualTo(hr);
    }

    @Test
    void aprobarPendienteConCancelacionEnCurso_tambienLaDeniega() {
        VacationRequest c = askCancel(stored(VacationStatus.PENDING, TODAY.plusDays(10)));

        VacationRequest done = service.resolve(new ResolveCommand(tenant, c.id(), hr, true, null));

        assertThat(done.status()).isEqualTo(VacationStatus.APPROVED);
        assertThat(done.cancelRequestStatus()).isEqualTo(CancellationStatus.DENIED);
    }
}
