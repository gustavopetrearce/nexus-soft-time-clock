package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator.LastEvent;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceCommand;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RegisterAttendanceServiceTest {

    @Mock AttendanceRepositoryPort attendance;
    @Mock IdempotencyStorePort idempotency;
    @Mock QrValidationPort qrValidation;
    @Mock GeofenceCheckPort geofenceCheck;
    @Mock FraudCheckPort fraudCheck;
    @Mock DeviceRecognitionPort deviceRecognition;
    @Mock WorkSitePolicyPort sitePolicy;
    @Mock SchedulePolicyPort schedulePolicy;
    @Mock EventTypeConfigPort eventTypeConfig;
    @Mock EvidenceStoragePort evidenceStorage;
    @Mock CompanyPolicyPort companyPolicy;
    @Mock AttendanceEventPublisherPort events;

    RegisterAttendanceService service;

    final UUID tenantId = UUID.randomUUID();
    final UUID userId = UUID.randomUUID();
    final UUID siteId = UUID.randomUUID();
    final UUID shiftId = UUID.randomUUID();
    final Instant serverNow = Instant.parse("2026-07-21T10:00:00Z");
    final Clock clock = Clock.fixed(serverNow, ZoneOffset.UTC);
    static final int OPEN_SHIFT_HOURS = 16;
    static final long OFFLINE_MAX_AGE_HOURS = 72;

    @BeforeEach
    void setUp() {
        service = new RegisterAttendanceService(attendance, idempotency, qrValidation,
                geofenceCheck, fraudCheck, deviceRecognition, sitePolicy, schedulePolicy,
                eventTypeConfig, evidenceStorage, companyPolicy, events, clock, OFFLINE_MAX_AGE_HOURS);
        lenient().when(companyPolicy.find(tenantId)).thenReturn(
                new CompanyPolicyPort.CompanyPolicy(null, false, false, OPEN_SHIFT_HOURS));
        // Por defecto el dispositivo es reconocido (device binding no interfiere). Lenient: el caso de
        // idempotencia corta antes de llegar a la validación de dispositivo.
        lenient().when(deviceRecognition.resolve(any(), any(), any(), any(), any(), any()))
                .thenReturn(new DeviceRecognitionPort.DeviceRecognition(true, DeviceRecognitionPort.Action.ALLOW));
        // Por defecto, sin turno vigente. La decisión se consulta siempre —el turno elegido se graba
        // en la marca aunque acabe rechazada—, así que los casos que se rechazan antes del horario
        // también necesitan una decisión con la que trabajar.
        lenient().when(schedulePolicy.check(any(), any(), any(), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.noSchedule());
    }

    /** Sin overrides de tipos de evento → todos los intermedios habilitados. */
    private void allEventTypesEnabledStub() {
        when(eventTypeConfig.findByTenant(tenantId)).thenReturn(java.util.Map.of());
    }

    /** Política de centro sin exigencias (foto/biometría opcionales, umbral por default). */
    private void permissiveSiteStub() {
        when(sitePolicy.find(tenantId, siteId)).thenReturn(WorkSitePolicyPort.SitePolicy.permissive());
    }

    /** El colaborador no tiene turno asignado vigente → sin restricción horaria. */
    private void noScheduleStub() {
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.noSchedule());
    }

    /** Hay turno vigente y la marca cae dentro de ventana, con {@code minutesLate} de retardo. */
    private void withinWindowStub(int minutesLate) {
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.withinWindow(minutesLate, shiftId));
    }

    private RegisterAttendanceCommand cmd() {
        return cmd("ENTRADA");
    }

    private RegisterAttendanceCommand cmd(String eventType) {
        return new RegisterAttendanceCommand(UUID.randomUUID(), siteId, "qr", 19.4326, -99.1332, 10.0,
                eventType, "dev-1", null, "ONLINE", false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");
    }

    /** Fichaje capturado sin red en {@code punchedAt} y enviado más tarde por el lote de sync. */
    private RegisterAttendanceCommand offlineCmd(Instant punchedAt) {
        return new RegisterAttendanceCommand(UUID.randomUUID(), siteId, "qr", 19.4326, -99.1332, 10.0,
                "ENTRADA", "dev-1", punchedAt.toEpochMilli(), "OFFLINE_SYNC",
                false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");
    }

    /** Clave con la forma que emite el servidor: t/{tenant}/s/{site}/d/{fecha}/u/{user}/{uuid}.jpg */
    private static final String VALID_KEY = "t/tenant/s/site/d/2026/07/21/u/user/foto.jpg";

    /**
     * Comando con evidencia. El bucket declarado es deliberadamente falso: el servidor debe
     * ignorarlo y persistir el suyo.
     */
    private RegisterAttendanceCommand cmdWithEvidence(String evidenceKey) {
        return new RegisterAttendanceCommand(UUID.randomUUID(), siteId, "qr", 19.4326, -99.1332, 10.0,
                "ENTRADA", "dev-1", null, "ONLINE", false, false, false, false, true, false,
                "bucket-del-cliente", evidenceKey, "hash", "ANDROID", "Pixel 7", "14");
    }

    private void evidenceStub(EvidenceStoragePort.Outcome outcome) {
        when(evidenceStorage.validate(eq(tenantId), eq(userId), eq(siteId), anyString(), any()))
                .thenReturn(outcome);
        if (outcome == EvidenceStoragePort.Outcome.VALID) {
            when(evidenceStorage.bucket()).thenReturn("evidence");
        }
    }

    /** Evento de dominio publicado, para comprobar qué señales viajan a los consumidores. */
    private com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered publishedRegistered() {
        var captor = org.mockito.ArgumentCaptor
                .forClass(com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered.class);
        verify(events).publish(captor.capture());
        return captor.getValue();
    }

    /** Registro efectivamente persistido, para comprobar qué quedó asociado. */
    private com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord savedRecord() {
        var captor = org.mockito.ArgumentCaptor
                .forClass(com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord.class);
        verify(attendance).save(captor.capture());
        return captor.getValue();
    }

    /** Deja pasar QR + antifraude + geocerca para llegar a la validación de secuencia. */
    private void validationsUpToSequenceStubs() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, true, 12.0, 50.0));
        permissiveSiteStub();
        noScheduleStub();
    }

    private void happyPathStubs() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, true, 12.0, 50.0));
        permissiveSiteStub();
        noScheduleStub();
    }

    @Test
    void registro_valido_esAceptado_yPublicaEvento() {
        happyPathStubs();

        AttendanceResult result = service.register(tenantId, userId, cmd());

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.rejectionReason()).isNull();
        assertThat(result.serverTime()).isEqualTo(Instant.parse("2026-07-21T10:00:00Z"));  // hora de servidor
        verify(attendance).save(any());
        verify(idempotency).save(eq(tenantId), any(), any());
        verify(events).publish(any());
    }

    @Test
    void fueraDeGeocerca_esRechazado() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, false, 350.0, 50.0));  // fuera del radio
        permissiveSiteStub();

        AttendanceResult result = service.register(tenantId, userId, cmd());

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("OUT_OF_GEOFENCE");
    }

    @Test
    void reenvio_delMismoUuid_devuelveResultadoPrevio_sinReprocesar() {
        AttendanceResult previous = new AttendanceResult(UUID.randomUUID(), "ACCEPTED", null,
                Instant.parse("2026-07-21T09:00:00Z"), 5.0, List.of(), 0);
        RegisterAttendanceCommand command = cmd();
        when(idempotency.find(tenantId, command.operationUuid())).thenReturn(Optional.of(previous));

        AttendanceResult result = service.register(tenantId, userId, command);

        assertThat(result).isEqualTo(previous);
        verify(attendance, never()).save(any());
        verify(qrValidation, never()).verify(any());
    }

    /**
     * El QR de centro lleva un nonce fijo durante toda su vigencia: debe servir para todos los
     * eventos de la jornada. Antes, "consumir" el nonce rechazaba el segundo evento del día como
     * REPLAY_DETECTED; ahora el orden lo gobierna solo la secuencia (RN-12).
     */
    @Test
    void mismoQr_sirveParaEventosSucesivosDelMismoDia() {
        happyPathStubs();
        allEventTypesEnabledStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        AttendanceResult entrada = service.register(tenantId, userId, cmd("ENTRADA"));
        AttendanceResult descanso = service.register(tenantId, userId, cmd("INICIO_DESCANSO"));

        assertThat(entrada.status()).isEqualTo("ACCEPTED");
        assertThat(descanso.status()).isEqualTo("ACCEPTED");
        // Ambos registros conservan el nonce del mismo QR como traza de auditoría.
        verify(attendance, times(2)).save(argThat(r -> "nonce-1".equals(r.qrNonce())));
    }

    @Test
    void mockLocation_bloqueante_esRechazadoPorFraude() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of("MOCK_LOCATION"), true, "FRAUD_MOCK_LOCATION"));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, true, 12.0, 50.0));
        permissiveSiteStub();

        AttendanceResult result = service.register(tenantId, userId, cmd());

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("FRAUD_MOCK_LOCATION");
        assertThat(result.flags()).contains("MOCK_LOCATION");
    }

    @Test
    void salida_sinEntradaAbierta_esRechazadaPorSecuencia() {
        validationsUpToSequenceStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());

        AttendanceResult result = service.register(tenantId, userId, cmd("SALIDA"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    @Test
    void salida_conEntradaAbierta_mismoCentro_esAceptada() {
        validationsUpToSequenceStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        AttendanceResult result = service.register(tenantId, userId, cmd("SALIDA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.rejectionReason()).isNull();
    }

    /**
     * Segundo turno del mismo día: tras cerrar la jornada se puede volver a entrar, y con el MISMO
     * QR de centro —que no está ligado a usuario, turno ni fecha (RN-26)—.
     */
    @Test
    void entradaTrasSalida_mismoDia_conElMismoQr_esAceptada() {
        validationsUpToSequenceStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.SALIDA, siteId)));

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        verify(attendance).save(argThat(r -> "nonce-1".equals(r.qrNonce())));
    }

    /**
     * La jornada abierta se consulta acotada a open_shift_max_hours: sin esa cota, una ENTRADA sin
     * su SALIDA dejaría al colaborador rechazado con INVALID_SEQUENCE para siempre.
     */
    @Test
    void secuencia_seConsultaAcotadaALaVentanaDeJornadaAbierta() {
        validationsUpToSequenceStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.empty());

        service.register(tenantId, userId, cmd("ENTRADA"));

        var since = org.mockito.ArgumentCaptor.forClass(Instant.class);
        verify(attendance).findLastAcceptedEvent(eq(tenantId), eq(userId), since.capture());
        assertThat(since.getValue())
                .isEqualTo(serverNow.minus(OPEN_SHIFT_HOURS, java.time.temporal.ChronoUnit.HOURS));
    }

    /** Fuera de la ventana no hay jornada que cerrar: la SALIDA tardía es incoherente. */
    @Test
    void salidaTardia_conJornadaYaCaducada_esRechazadaPorSecuencia() {
        validationsUpToSequenceStubs();
        // El repositorio ya aplica la cota: una ENTRADA anterior a `since` no se devuelve.
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.empty());

        AttendanceResult result = service.register(tenantId, userId, cmd("SALIDA"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    /**
     * El descanso pertenece a la jornada, y la jornada a un centro: sin CAMBIO_SITIO de por medio,
     * terminarlo en otro centro la arrastraría y permitiría cerrarla allí.
     */
    @Test
    void finDescanso_enOtroCentro_esRechazadoPorSecuencia() {
        validationsUpToSequenceStubs();
        allEventTypesEnabledStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.INICIO_DESCANSO, UUID.randomUUID())));

        AttendanceResult result = service.register(tenantId, userId, cmd("FIN_DESCANSO"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    /**
     * Un fichaje offline sincronizado horas después debe contrastarse con la hora a la que ocurrió,
     * no con la de llegada; si no, cae siempre fuera de la ventana del turno.
     */
    @Test
    void offlineSync_evaluaVentanaDeTurnoConLaHoraDelDispositivo() {
        validationsUpToSequenceStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        Instant punchedAt = serverNow.minus(9, java.time.temporal.ChronoUnit.HOURS);

        AttendanceResult result = service.register(tenantId, userId, offlineCmd(punchedAt));

        verify(schedulePolicy).check(tenantId, userId, siteId, AttendanceEventType.ENTRADA, punchedAt);
        assertThat(result.flags()).contains("OFFLINE_DEVICE_TIME_USED");
    }

    /** Un reloj de dispositivo absurdo no gobierna la ventana: se cae a la hora de servidor. */
    @Test
    void offlineSync_conHoraDeDispositivoDemasiadoAntigua_usaLaDelServidor() {
        validationsUpToSequenceStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        Instant tooOld = serverNow.minus(OFFLINE_MAX_AGE_HOURS + 1, java.time.temporal.ChronoUnit.HOURS);

        AttendanceResult result = service.register(tenantId, userId, offlineCmd(tooOld));

        verify(schedulePolicy).check(tenantId, userId, siteId, AttendanceEventType.ENTRADA, serverNow);
        assertThat(result.flags()).doesNotContain("OFFLINE_DEVICE_TIME_USED");
    }

    /** Un QR caducado se rechaza como INVALID_QR, pero deja traza de por qué. */
    @Test
    void qrExpirado_dejaBanderaDistinguible() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr")).thenReturn(QrValidationPort.QrCheck.expiredToken());
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, true, 12.0, 50.0));
        permissiveSiteStub();

        AttendanceResult result = service.register(tenantId, userId, cmd());

        assertThat(result.rejectionReason()).isEqualTo("INVALID_QR");
        assertThat(result.flags()).contains("QR_EXPIRED");
    }

    @Test
    void dobleInicioDescanso_esRechazadoPorSecuencia() {
        validationsUpToSequenceStubs();
        allEventTypesEnabledStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.INICIO_DESCANSO, siteId)));

        AttendanceResult result = service.register(tenantId, userId, cmd("INICIO_DESCANSO"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    /** Como validationsUpToSequenceStubs pero permite fijar la política del centro. */
    private void baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy policy) {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, true, 12.0, 50.0));
        when(sitePolicy.find(tenantId, siteId)).thenReturn(policy);
    }

    @Test
    void umbralDePrecisionPorCentro_masEstricto_rechazaLOW_GPS_ACCURACY() {
        // precisión del dispositivo 10 m: pasa el default (50) pero no el umbral por-centro (5).
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(5, false, false));

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("LOW_GPS_ACCURACY");
    }

    @Test
    void fotoObligatoria_sinEvidencia_esRechazada() {
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(null, true, false));
        noScheduleStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));  // sin evidenceKey

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("PHOTO_REQUIRED");
    }

    @Test
    void fotoObligatoria_conEvidenciaVerificada_esAceptada() {
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(null, true, false));
        noScheduleStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        evidenceStub(EvidenceStoragePort.Outcome.VALID);

        AttendanceResult result = service.register(tenantId, userId, cmdWithEvidence(VALID_KEY));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        // El bucket persistido es el del servidor, no el que declaró el cliente.
        assertThat(savedRecord().evidence().bucket()).isEqualTo("evidence");
        assertThat(savedRecord().evidence().key()).isEqualTo(VALID_KEY);
    }

    /**
     * El agujero que cerró RF-18: antes bastaba con enviar cualquier cadena en {@code evidenceKey}
     * para dar por cumplida la exigencia de foto, porque nadie comprobaba que el objeto existiera.
     */
    @Test
    void fotoObligatoria_conClaveInventada_esRechazada() {
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(null, true, false));
        noScheduleStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        evidenceStub(EvidenceStoragePort.Outcome.MISSING);

        AttendanceResult result = service.register(tenantId, userId, cmdWithEvidence("inventada"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("PHOTO_REQUIRED");
        assertThat(result.flags()).contains("EVIDENCE_REJECTED_MISSING");
    }

    @Test
    void fotoObligatoria_conClaveDeOtroUsuario_esRechazada() {
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(null, true, false));
        noScheduleStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        evidenceStub(EvidenceStoragePort.Outcome.FOREIGN_PREFIX);

        AttendanceResult result = service.register(tenantId, userId, cmdWithEvidence("t/otro/s/x/u/y/z.jpg"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("PHOTO_REQUIRED");
    }

    /** Sin poder verificar la evidencia se falla cerrado: es preferible bloquear que aceptar una foto fantasma. */
    @Test
    void fotoObligatoria_conAlmacenamientoCaido_esRechazada() {
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(null, true, false));
        noScheduleStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        evidenceStub(EvidenceStoragePort.Outcome.UNAVAILABLE);

        AttendanceResult result = service.register(tenantId, userId, cmdWithEvidence(VALID_KEY));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("PHOTO_REQUIRED");
    }

    /**
     * Con la foto opcional, un fallo de subida no puede costarle el fichaje al colaborador: se acepta
     * el registro sin evidencia y queda la bandera para que el supervisor lo revise.
     */
    @Test
    void fotoOpcional_conEvidenciaInvalida_seAceptaSinEvidencia() {
        happyPathStubs();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());
        evidenceStub(EvidenceStoragePort.Outcome.MISSING);

        AttendanceResult result = service.register(tenantId, userId, cmdWithEvidence("inventada"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.flags()).contains("EVIDENCE_REJECTED_MISSING");
        assertThat(savedRecord().evidence()).isNull();
    }

    /** La evidencia verificada se conserva aunque el registro se rechace: prueba de un intento real. */
    @Test
    void evidenciaVerificada_sePersisteAunqueElRegistroSeaRechazado() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        // Fuera de la geocerca: el registro se rechazará antes de llegar a la política de foto.
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, false, 900.0, 50.0));
        permissiveSiteStub();
        noScheduleStub();
        evidenceStub(EvidenceStoragePort.Outcome.VALID);

        AttendanceResult result = service.register(tenantId, userId, cmdWithEvidence(VALID_KEY));

        assertThat(result.rejectionReason()).isEqualTo("OUT_OF_GEOFENCE");
        assertThat(savedRecord().evidence()).isNotNull();
        assertThat(savedRecord().evidence().key()).isEqualTo(VALID_KEY);
    }

    @Test
    void biometriaObligatoria_sinVerificacion_esRechazada() {
        baseStubsWithPolicy(new WorkSitePolicyPort.SitePolicy(null, false, true));
        noScheduleStub();
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any())).thenReturn(Optional.empty());

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));  // biometricVerified=false

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("BIOMETRIC_REQUIRED");
    }

    @Test
    void tipoDeEventoDeshabilitado_esRechazado() {
        when(idempotency.find(eq(tenantId), any())).thenReturn(Optional.empty());
        when(qrValidation.verify("qr"))
                .thenReturn(new QrValidationPort.QrCheck(true, false, tenantId, siteId, "nonce-1"));
        when(fraudCheck.evaluate(anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(new FraudCheckPort.FraudCheckResult(List.of(), false, null));
        when(geofenceCheck.check(eq(tenantId), eq(siteId), anyDouble(), anyDouble()))
                .thenReturn(new GeofenceCheckPort.GeofenceCheck(true, true, 12.0, 50.0));
        permissiveSiteStub();
        // La empresa deshabilitó CAMBIO_SITIO.
        when(eventTypeConfig.findByTenant(tenantId)).thenReturn(java.util.Map.of(
                AttendanceEventType.CAMBIO_SITIO,
                new com.condor.nexussoft.timeclock.attendance.domain.EventTypeSetting(
                        AttendanceEventType.CAMBIO_SITIO, false, "Cambio de sitio")));

        AttendanceResult result = service.register(tenantId, userId, cmd("CAMBIO_SITIO"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("EVENT_TYPE_DISABLED");
    }

    @Test
    void fueraDeVentanaDeTurno_esRechazada() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.outOfWindow());

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("OUT_OF_SCHEDULE");
        assertThat(result.flags()).contains("OUT_OF_SCHEDULE");
    }

    /**
     * La ventana gobierna cuándo se puede ABRIR la jornada, así que no puede impedir cerrarla:
     * rechazar la SALIDA dejaba al colaborador con la jornada abierta hasta que caducara (RN-12).
     * Se acepta, y la bandera deja constancia para el supervisor.
     */
    @Test
    void salidaFueraDeVentana_seAceptaConBandera() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.outOfWindow());
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        AttendanceResult result = service.register(tenantId, userId, cmd("SALIDA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.rejectionReason()).isNull();
        assertThat(result.flags()).contains("OUT_OF_SCHEDULE");
    }

    /** Lo mismo para los intermedios: ocurren dentro de una jornada ya abierta. */
    @Test
    void eventoIntermedioFueraDeVentana_seAceptaConBandera() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        allEventTypesEnabledStub();
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.outOfWindow());
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        AttendanceResult result = service.register(tenantId, userId, cmd("INICIO_DESCANSO"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.flags()).contains("OUT_OF_SCHEDULE");
    }

    /** La marca aceptada fuera de ventana llega a incidencias por el evento, no por la bandera. */
    @Test
    void salidaFueraDeVentana_publicaElEventoMarcadoFueraDeVentana() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        when(schedulePolicy.check(eq(tenantId), eq(userId), eq(siteId), any(), any()))
                .thenReturn(SchedulePolicyPort.ScheduleDecision.outOfWindow());
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));

        service.register(tenantId, userId, cmd("SALIDA"));

        assertThat(publishedRegistered().outOfWindow()).isTrue();
    }

    @Test
    void marcaDentroDeVentana_publicaElEventoSinLaSenal() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        withinWindowStub(0);

        service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(publishedRegistered().outOfWindow()).isFalse();
    }

    @Test
    void entrada_dentroDeVentana_trasTolerancia_esAceptadaYMarcadaComoRetardo() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        withinWindowStub(12);   // 12 min tras la tolerancia

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.rejectionReason()).isNull();
        assertThat(result.minutesLate()).isEqualTo(12);
        assertThat(result.flags()).contains("LATE");
    }

    /**
     * El turno que decidió la ventana queda grabado en la marca: sin él, un retardo no es auditable
     * —no se puede saber contra qué inicio se midió— y el reporte no puede partir el día por turno.
     */
    @Test
    void turnoQueCasoLaVentana_quedaEnElRegistro() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        withinWindowStub(12);

        service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(savedRecord().shiftId()).isEqualTo(shiftId);
    }

    /** Sin turno vigente no hay nada que atribuir, y la columna queda vacía en vez de inventada. */
    @Test
    void sinTurnoVigente_elRegistroNoLlevaTurno() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        noScheduleStub();

        service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(savedRecord().shiftId()).isNull();
    }

    @Test
    void entrada_dentroDeTolerancia_esAceptadaSinRetardo() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        withinWindowStub(0);    // puntual (dentro de tolerancia)

        AttendanceResult result = service.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.minutesLate()).isZero();
        assertThat(result.flags()).doesNotContain("LATE");
    }

    @Test
    void salida_trasTolerancia_noGeneraRetardo() {
        baseStubsWithPolicy(WorkSitePolicyPort.SitePolicy.permissive());
        when(attendance.findLastAcceptedEvent(eq(tenantId), eq(userId), any()))
                .thenReturn(Optional.of(new LastEvent(AttendanceEventType.ENTRADA, siteId)));
        withinWindowStub(30);   // el retardo solo aplica a ENTRADA (RN-16)

        AttendanceResult result = service.register(tenantId, userId, cmd("SALIDA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.minutesLate()).isZero();
        assertThat(result.flags()).doesNotContain("LATE");
    }

    @Test
    void dispositivoNoReconocido_conPoliticaReject_esRechazado() {
        validationsUpToSequenceStubs();
        when(deviceRecognition.resolve(any(), any(), any(), any(), any(), any()))
                .thenReturn(new DeviceRecognitionPort.DeviceRecognition(false, DeviceRecognitionPort.Action.REJECT));

        AttendanceResult result = service.register(tenantId, userId, cmd());

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("UNTRUSTED_DEVICE");
    }

    @Test
    void dispositivoNoReconocido_conPoliticaFlag_esAceptadoConMarca() {
        happyPathStubs();
        when(deviceRecognition.resolve(any(), any(), any(), any(), any(), any()))
                .thenReturn(new DeviceRecognitionPort.DeviceRecognition(false, DeviceRecognitionPort.Action.FLAG));

        AttendanceResult result = service.register(tenantId, userId, cmd());

        assertThat(result.status()).isEqualTo("ACCEPTED");
        assertThat(result.rejectionReason()).isNull();
        assertThat(result.flags()).contains("UNTRUSTED_DEVICE");
    }
}
