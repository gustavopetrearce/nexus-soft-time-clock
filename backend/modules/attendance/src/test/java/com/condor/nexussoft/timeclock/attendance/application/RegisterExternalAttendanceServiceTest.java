package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator.LastEvent;
import com.condor.nexussoft.timeclock.attendance.domain.BreakType;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRejected;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterExternalAttendanceUseCase.ExternalAttendanceCommand;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.*;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.ExternalIntegrationPort.Collaborator;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.ExternalIntegrationPort.Eligibility;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RegisterExternalAttendanceServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T15:00:00Z");
    private static final int OPEN_SHIFT_HOURS = 16;
    private static final long MAX_AGE_HOURS = 72;

    @Mock
    private ExternalIntegrationPort integration;
    @Mock
    private AttendanceRepositoryPort attendance;
    @Mock
    private IdempotencyStorePort idempotency;
    @Mock
    private WorkSitePolicyPort sitePolicy;
    @Mock
    private SchedulePolicyPort schedulePolicy;
    @Mock
    private EventTypeConfigPort eventTypeConfig;
    @Mock
    private BreakTypePort breakTypes;
    @Mock
    private CompanyPolicyPort companyPolicy;
    @Mock
    private AttendanceEventPublisherPort events;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID clientId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID siteId = UUID.randomUUID();

    private RegisterExternalAttendanceService service;

    @BeforeEach
    void setUp() {
        service = new RegisterExternalAttendanceService(integration, attendance, idempotency, sitePolicy,
                schedulePolicy, eventTypeConfig, breakTypes, companyPolicy, events, Clock.fixed(NOW, ZoneOffset.UTC),
                MAX_AGE_HOURS);
        lenient().when(integration.isClientActive(tenantId, clientId)).thenReturn(true);
        lenient().when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        lenient().when(integration.findCollaborator(tenantId, "EMP-1"))
                .thenReturn(Optional.of(new Collaborator(userId, Eligibility.ELIGIBLE)));
        lenient().when(sitePolicy.isActive(tenantId, siteId)).thenReturn(true);
        lenient().when(companyPolicy.find(tenantId)).thenReturn(
                new CompanyPolicyPort.CompanyPolicy(null, false, false, OPEN_SHIFT_HOURS, false));
        lenient().when(schedulePolicy.check(any(), any(), any(), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.noSchedule());
        lenient().when(eventTypeConfig.findByTenant(tenantId)).thenReturn(Map.of());
    }

    private ExternalAttendanceCommand cmd(String eventType, Instant eventTime) {
        return new ExternalAttendanceCommand(UUID.randomUUID(), "EMP-1", siteId, eventType, eventTime);
    }

    private AttendanceRecord savedRecord() {
        ArgumentCaptor<AttendanceRecord> record = ArgumentCaptor.forClass(AttendanceRecord.class);
        verify(attendance).save(record.capture());
        return record.getValue();
    }

    private void assertRejectedWithCode(ExternalAttendanceCommand command, String code) {
        assertThatThrownBy(() -> service.register(tenantId, clientId, command))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).getCode())
                .isEqualTo(code);
        verify(attendance, never()).save(any());
        verify(idempotency, never()).save(any(), any(), any());
    }

    @Test
    void marcaValida_seGuardaSinGpsConLaHoraDelEvento() {
        Instant eventTime = NOW.minus(10, ChronoUnit.MINUTES);

        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", eventTime));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.serverTime()).isEqualTo(eventTime);
        // Sin turno vigente (stub por defecto): se acepta igual que por QR, pero marcada.
        assertThat(result.flags()).containsExactly("EXTERNAL_SOURCE", "NO_SCHEDULE");

        AttendanceRecord record = savedRecord();
        assertThat(record.serverTime()).isEqualTo(eventTime);
        assertThat(record.userId()).isEqualTo(userId);
        assertThat(record.gps()).isNull();
        assertThat(record.source()).isEqualTo("EXTERNAL");
        assertThat(record.validationsJson()).contains(clientId.toString());

        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publish((AttendanceRegistered) event.capture());
        // El evento lleva la hora de llegada: la bitácora no debe poder fecharse hacia atrás.
        assertThat(((AttendanceRegistered) event.getValue()).occurredAt()).isEqualTo(NOW);
        assertThat(((AttendanceRegistered) event.getValue()).noSchedule()).isTrue();
    }

    @Test
    void credencialRevocada_noRegistraNiDevuelveResultadosPrevios() {
        when(integration.isClientActive(tenantId, clientId)).thenReturn(false);

        assertThatThrownBy(() -> service.register(tenantId, clientId, cmd("ENTRADA", NOW)))
                .isInstanceOf(AuthorizationException.class);
        verifyNoInteractions(idempotency, attendance);
    }

    @Test
    void reenvioConElMismoUuid_devuelveElResultadoPrevioSinRegistrar() {
        ExternalAttendanceCommand command = cmd("ENTRADA", NOW);
        AttendanceResult previous = new AttendanceResult(UUID.randomUUID(), "ACCEPTED", null, NOW, null, List.of(), 0);
        when(idempotency.find(tenantId, command.operationUuid())).thenReturn(Optional.of(previous));

        assertThat(service.register(tenantId, clientId, command)).isSameAs(previous);
        verify(attendance, never()).save(any());
    }

    @Test
    void reenvioFueraDeRango_tambienDevuelveElResultadoPrevio() {
        ExternalAttendanceCommand command = cmd("ENTRADA", NOW.minus(Duration.ofDays(30)));
        AttendanceResult previous = new AttendanceResult(UUID.randomUUID(), "ACCEPTED", null, NOW, null, List.of(), 0);
        when(idempotency.find(tenantId, command.operationUuid())).thenReturn(Optional.of(previous));

        assertThat(service.register(tenantId, clientId, command)).isSameAs(previous);
    }

    @Test
    void colaboradorDesconocido_noCreaRegistro() {
        when(integration.findCollaborator(tenantId, "EMP-1")).thenReturn(Optional.empty());

        assertRejectedWithCode(cmd("ENTRADA", NOW), "EMPLOYEE_NOT_FOUND");
    }

    @Test
    void colaboradorInactivo_noCreaRegistro() {
        when(integration.findCollaborator(tenantId, "EMP-1"))
                .thenReturn(Optional.of(new Collaborator(userId, Eligibility.INACTIVE)));

        assertRejectedWithCode(cmd("ENTRADA", NOW), "EMPLOYEE_INACTIVE");
    }

    @Test
    void usuarioSinPermisoDeRegistro_noCreaRegistro() {
        when(integration.findCollaborator(tenantId, "EMP-1"))
                .thenReturn(Optional.of(new Collaborator(userId, Eligibility.NOT_ENABLED)));

        assertRejectedWithCode(cmd("ENTRADA", NOW), "EMPLOYEE_NOT_ENABLED");
    }

    @Test
    void centroInexistenteOAjeno_noCreaRegistro() {
        when(sitePolicy.isActive(tenantId, siteId)).thenReturn(false);

        assertRejectedWithCode(cmd("ENTRADA", NOW), "WORK_SITE_NOT_FOUND");
    }

    @Test
    void horaDemasiadoAntigua_noCreaRegistro() {
        assertRejectedWithCode(cmd("ENTRADA", NOW.minus(MAX_AGE_HOURS, ChronoUnit.HOURS).minusSeconds(1)),
                "EVENT_TIME_OUT_OF_RANGE");
    }

    @Test
    void horaEnElLimiteDeAntiguedad_seAcepta() {
        assertThat(service.register(tenantId, clientId, cmd("ENTRADA", NOW.minus(MAX_AGE_HOURS, ChronoUnit.HOURS))).status())
                .isEqualTo("ACCEPTED");
    }

    @Test
    void horaFuturaFueraDeTolerancia_noCreaRegistro() {
        assertRejectedWithCode(cmd("ENTRADA", NOW.plus(Duration.ofMinutes(5)).plusSeconds(1)),
                "EVENT_TIME_OUT_OF_RANGE");
    }

    /**
     * Se acepta, pero con la hora de llegada: guardada en el futuro, una marca por QR posterior se
     * validaría contra ella y quedaría fechada antes, desordenando la jornada.
     */
    @Test
    void horaFuturaDentroDeTolerancia_seAceptaConLaHoraDeLlegada() {
        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", NOW.plus(Duration.ofMinutes(5))));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.serverTime()).isEqualTo(NOW);
        assertThat(result.flags()).contains("EVENT_TIME_CLAMPED");
        assertThat(savedRecord().serverTime()).isEqualTo(NOW);
    }

    @Test
    void horaPasada_noSeRecorta() {
        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", NOW.minusSeconds(1)));

        assertThat(result.serverTime()).isEqualTo(NOW.minusSeconds(1));
        assertThat(result.flags()).doesNotContain("EVENT_TIME_CLAMPED");
    }

    @Test
    void conTurnoVigente_noSeMarcaSinTurno() {
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.withinWindow(0, UUID.randomUUID()));

        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", NOW));

        assertThat(result.flags()).doesNotContain("NO_SCHEDULE");
    }

    @Test
    void entradaFueraDeVentana_seRechazaYSeGuarda() {
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), eq(AttendanceEventType.ENTRADA), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.outOfWindow(UUID.randomUUID()));

        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", NOW));

        assertThat(result.rejectionReason()).isEqualTo("OUT_OF_SCHEDULE");
        assertThat(savedRecord().isAccepted()).isFalse();
        verify(events).publish(any(AttendanceRejected.class));
    }

    @Test
    void salidaFueraDeVentana_seAceptaMarcada() {
        when(attendance.findLastAcceptedEventBefore(eq(tenantId), eq(userId), any(), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), eq(AttendanceEventType.SALIDA), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.outOfWindow(UUID.randomUUID()));

        AttendanceResult result = service.register(tenantId, clientId, cmd("SALIDA", NOW));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.flags()).contains("OUT_OF_SCHEDULE");
    }

    // ---- Categorías de descanso (V30) ----

    private ExternalAttendanceCommand breakCmd(String eventType, String breakTypeCode) {
        return new ExternalAttendanceCommand(UUID.randomUUID(), "EMP-1", siteId, eventType, NOW, breakTypeCode);
    }

    private UUID almuerzoStub() {
        UUID almuerzo = UUID.randomUUID();
        when(breakTypes.findByTenant(tenantId)).thenReturn(List.of(
                new BreakType(almuerzo, tenantId, "ALMUERZO", "Almuerzo", true, false, null, 0)));
        return almuerzo;
    }

    @Test
    void inicioDescanso_conCodigoDeCategoria_laResuelveYLaGuarda() {
        UUID almuerzo = almuerzoStub();
        when(attendance.findLastAcceptedEventBefore(eq(tenantId), eq(userId), any(), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        AttendanceResult result = service.register(tenantId, clientId, breakCmd("INICIO_DESCANSO", "almuerzo"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(savedRecord().breakTypeId()).isEqualTo(almuerzo);
    }

    @Test
    void inicioDescanso_sinCodigo_esOpcionalParaElEmisorExterno() {
        almuerzoStub();
        when(attendance.findLastAcceptedEventBefore(eq(tenantId), eq(userId), any(), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        AttendanceResult result = service.register(tenantId, clientId, breakCmd("INICIO_DESCANSO", null));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(savedRecord().breakTypeId()).isNull();
    }

    @Test
    void inicioDescanso_conCodigoDesconocido_esRechazado() {
        almuerzoStub();

        AttendanceResult result = service.register(tenantId, clientId, breakCmd("INICIO_DESCANSO", "SIESTA"));

        assertThat(result.rejectionReason()).isEqualTo("INVALID_BREAK_TYPE");
    }

    @Test
    void finDescanso_heredaLaCategoriaDelDescansoAbierto() {
        UUID almuerzo = UUID.randomUUID();
        when(attendance.findLastAcceptedEventBefore(eq(tenantId), eq(userId), any(), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.INICIO_DESCANSO, siteId, almuerzo)));

        AttendanceResult result = service.register(tenantId, clientId, breakCmd("FIN_DESCANSO", null));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(savedRecord().breakTypeId()).isEqualTo(almuerzo);
    }

    @Test
    void salidaSinEntrada_seRechazaPorSecuencia() {
        when(attendance.findLastAcceptedEventBefore(eq(tenantId), eq(userId), any(), any()))
                .thenReturn(Optional.empty());

        AttendanceResult result = service.register(tenantId, clientId, cmd("SALIDA", NOW));

        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    @Test
    void secuencia_seEvaluaEnElMomentoDelEvento() {
        Instant eventTime = NOW.minus(5, ChronoUnit.HOURS);
        when(attendance.findLastAcceptedEventBefore(tenantId, userId,
                eventTime.minus(OPEN_SHIFT_HOURS, ChronoUnit.HOURS), eventTime))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        assertThat(service.register(tenantId, clientId, cmd("SALIDA", eventTime)).status()).isEqualTo("ACCEPTED");
    }

    @Test
    void marcaAnteriorAOtraAceptada_seRechazaEnVezDeIntercalarse() {
        Instant eventTime = NOW.minus(5, ChronoUnit.HOURS);
        when(attendance.existsAcceptedEventSince(tenantId, userId, eventTime)).thenReturn(true);

        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", eventTime));

        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
        verify(attendance, never()).findLastAcceptedEventBefore(any(), any(), any(), any());
    }

    @Test
    void entradaConRetardo_seMarcaLate() {
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), eq(AttendanceEventType.ENTRADA), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.withinWindow(12, UUID.randomUUID()));

        AttendanceResult result = service.register(tenantId, clientId, cmd("ENTRADA", NOW));

        assertThat(result.minutesLate()).isEqualTo(12);
        assertThat(result.flags()).contains("LATE");
    }
}
