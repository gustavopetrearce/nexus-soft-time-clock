package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.*;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRejected;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.*;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Núcleo del sistema (CU-02). Aplica, en orden, las validaciones de:
 * idempotencia → QR firmado → antifraude → device binding → geocerca/precisión → horario →
 * secuencia de jornada → evidencia/biometría, fija la hora de servidor (RN-11), persiste el
 * registro (aceptado o rechazado con motivo) y publica el evento de dominio.
 *
 * <p>El anti-replay (RN-26) descansa en la idempotencia por {@code operation_uuid} (RN-51) y en la
 * secuencia coherente (RN-12), no en consumir el nonce del QR: el QR de centro lleva un nonce fijo
 * durante toda su vigencia y debe servir para todos los eventos de la jornada, y para todos los
 * turnos del día.</p>
 */
@Service
public class RegisterAttendanceService implements RegisterAttendanceUseCase {

    private final AttendanceRepositoryPort attendance;
    private final IdempotencyStorePort idempotency;
    private final QrValidationPort qrValidation;
    private final GeofenceCheckPort geofenceCheck;
    private final FraudCheckPort fraudCheck;
    private final DeviceRecognitionPort deviceRecognition;
    private final WorkSitePolicyPort sitePolicy;
    private final SchedulePolicyPort schedulePolicy;
    private final EventTypeConfigPort eventTypeConfig;
    private final EvidenceStoragePort evidenceStorage;
    private final CompanyPolicyPort companyPolicy;
    private final AttendanceEventPublisherPort events;
    private final Clock clock;

    /**
     * Antigüedad máxima de un fichaje offline para evaluar su ventana de turno con la hora del
     * dispositivo en lugar de la de llegada. Más allá, se usa la del servidor.
     */
    private final long offlineMaxAgeHours;

    public RegisterAttendanceService(AttendanceRepositoryPort attendance, IdempotencyStorePort idempotency,
                                     QrValidationPort qrValidation,
                                     GeofenceCheckPort geofenceCheck, FraudCheckPort fraudCheck,
                                     DeviceRecognitionPort deviceRecognition,
                                     WorkSitePolicyPort sitePolicy, SchedulePolicyPort schedulePolicy,
                                     EventTypeConfigPort eventTypeConfig, EvidenceStoragePort evidenceStorage,
                                     CompanyPolicyPort companyPolicy,
                                     AttendanceEventPublisherPort events,
                                     Clock clock,
                                     @Value("${attendance.offline.max-age-hours:72}") long offlineMaxAgeHours) {
        this.attendance = attendance;
        this.idempotency = idempotency;
        this.qrValidation = qrValidation;
        this.geofenceCheck = geofenceCheck;
        this.fraudCheck = fraudCheck;
        this.deviceRecognition = deviceRecognition;
        this.sitePolicy = sitePolicy;
        this.schedulePolicy = schedulePolicy;
        this.eventTypeConfig = eventTypeConfig;
        this.evidenceStorage = evidenceStorage;
        this.companyPolicy = companyPolicy;
        this.events = events;
        this.clock = clock;
        this.offlineMaxAgeHours = offlineMaxAgeHours;
    }

    @Override
    @Transactional
    public AttendanceResult register(UUID tenantId, UUID userId, RegisterAttendanceCommand cmd) {
        // 0) Idempotencia: reenvío del mismo UUID → devuelve el resultado previo (RN-51).
        var previous = idempotency.find(tenantId, cmd.operationUuid());
        if (previous.isPresent()) {
            return previous.get();
        }

        Instant now = clock.instant();              // hora de servidor autoritativa (RN-11)
        UUID recordId = UUID.randomUUID();
        AttendanceEventType eventType = AttendanceEventType.valueOf(cmd.eventType());
        String source = normalizeSource(cmd.source());
        List<String> flags = new ArrayList<>();
        RejectionReason reason = null;

        // Momento con el que se contrasta la ventana de turno. Para un lote offline sincronizado
        // horas después, la hora de llegada caería sistemáticamente fuera de ventana (OUT_OF_SCHEDULE
        // espurio), así que se usa la del dispositivo. Es un dato manipulable, pero se acota al
        // pasado y en antigüedad, queda marcado con una bandera visible para el supervisor y el
        // resto de barreras (geocerca, antifraude, device binding) siguen actuando. La hora oficial
        // del registro sigue siendo la del servidor (RN-11).
        Instant effectiveTime = effectiveTime(cmd, source, now);
        if (!effectiveTime.equals(now)) {
            flags.add("OFFLINE_DEVICE_TIME_USED");
        }

        // 1) QR firmado + vigencia + coincidencia de tenant/centro (RN-25).
        QrValidationPort.QrCheck qr = qrValidation.verify(cmd.qrToken());
        boolean qrOk = qr.valid() && !qr.expired()
                && tenantId.equals(qr.tenantId()) && cmd.workSiteId().equals(qr.workSiteId());
        if (qr.expired()) {
            // Mismo motivo de rechazo, pero distinguible en la traza: es el fallo más probable de un
            // lote offline contra un QR de vigencia corta.
            flags.add("QR_EXPIRED");
        }
        if (!qrOk) {
            reason = RejectionReason.INVALID_QR;
        }

        // 1.5) Tipo de evento habilitado para la empresa (HU-12 CA1). Solo se consulta para tipos
        //       intermedios; ENTRADA/SALIDA son núcleo y siempre están habilitados.
        if (reason == null && EventTypeCatalog.isConfigurable(eventType)
                && !EventTypeCatalog.isEnabled(eventType, eventTypeConfig.findByTenant(tenantId))) {
            reason = RejectionReason.EVENT_TYPE_DISABLED;
        }

        // 2) Antifraude (mock, root, spoofing, GPS) — RN-20..RN-28.
        FraudCheckPort.FraudCheckResult fraud = fraudCheck.evaluate(cmd.mockLocation(),
                cmd.rootedOrJailbroken(), cmd.gpsSpoofApp(), cmd.gpsDisabled(), cmd.deviceTrusted());
        flags.addAll(fraud.flagTypes());
        if (reason == null && fraud.blocked()) {
            reason = RejectionReason.valueOf(fraud.blockingReason());
        }

        // 2.5) Device binding (RF-28, RN-27): el dispositivo debe ser uno reconocido del colaborador.
        //       El servidor decide la confianza desde el registro de dispositivos (no del flag del cliente);
        //       enrola con TOFU y aplica la política del tenant (REJECT bloquea, FLAG solo marca).
        DeviceRecognitionPort.DeviceRecognition device = deviceRecognition.resolve(tenantId, userId,
                cmd.deviceId(), cmd.devicePlatform(), cmd.deviceModel(), cmd.deviceOsVersion());
        if (device.action() == DeviceRecognitionPort.Action.FLAG) {
            flags.add("UNTRUSTED_DEVICE");
        } else if (reason == null && device.action() == DeviceRecognitionPort.Action.REJECT) {
            reason = RejectionReason.UNTRUSTED_DEVICE;
        }

        // 3) Geocerca + precisión GPS (RN-13, RN-14). El umbral de precisión es por-centro (HU-10);
        //    si el centro no lo define, se usa el default de plataforma que expone la geocerca.
        GeofenceCheckPort.GeofenceCheck geo = geofenceCheck.check(tenantId, cmd.workSiteId(),
                cmd.latitude(), cmd.longitude());
        Double distance = geo.exists() ? geo.distanceM() : null;
        WorkSitePolicyPort.SitePolicy policy = sitePolicy.find(tenantId, cmd.workSiteId());
        double accuracyMax = policy.gpsAccuracyMaxM() != null ? policy.gpsAccuracyMaxM() : geo.accuracyMaxM();
        if (reason == null) {
            if (cmd.accuracyM() > accuracyMax) {
                reason = RejectionReason.LOW_GPS_ACCURACY;
            } else if (!geo.exists() || !geo.withinRadius()) {
                reason = RejectionReason.OUT_OF_GEOFENCE;
            }
        }

        // 3.4) Ventana de horario del turno asignado (RN-15, HU-10 CA1). Sin turno vigente no restringe.
        //      La ventana gobierna CUÁNDO se puede abrir la jornada, así que solo rechaza la ENTRADA:
        //      rechazar una SALIDA tardía dejaba al colaborador sin poder cerrar, con la jornada
        //      abierta hasta que caducara por open_shift_max_hours (RN-12). El resto de eventos se
        //      aceptan marcados, y esa marca abre una incidencia FUERA_DE_VENTANA.
        SchedulePolicyPort.ScheduleDecision schedule =
                schedulePolicy.check(tenantId, userId, cmd.workSiteId(), eventType, effectiveTime);
        boolean outOfWindow = schedule.outcome() == SchedulePolicyPort.Outcome.OUT_OF_WINDOW;
        if (outOfWindow) {
            flags.add("OUT_OF_SCHEDULE");
        }
        if (reason == null && outOfWindow && eventType == AttendanceEventType.ENTRADA) {
            reason = RejectionReason.OUT_OF_SCHEDULE;
        }

        // 3.5) Secuencia coherente de la jornada (RN-12): entrada/salida emparejadas en el mismo
        //       centro (HU-11 CA1), sin dobles descansos ni eventos fuera de orden (HU-12 CA2).
        if (reason == null) {
            // La jornada abierta caduca: sin cota, una ENTRADA sin su SALIDA bloquearía al
            // colaborador para siempre (INVALID_SEQUENCE en cada intento posterior), porque nada
            // cierra las jornadas huérfanas. Ventana deslizante —no día natural— para no partir en
            // dos un turno nocturno.
            Instant since = now.minus(companyPolicy.find(tenantId).openShiftMaxHours(), ChronoUnit.HOURS);
            reason = AttendanceSequenceValidator
                    .validate(attendance.findLastAcceptedEvent(tenantId, userId, since),
                            eventType, cmd.workSiteId())
                    .orElse(null);
        }

        // 3.6) Evidencia fotográfica (HU-13). La clave la emitió el servidor al prefirmar la subida;
        //       aquí se comprueba contra el almacenamiento que el objeto EXISTE, cuelga del prefijo
        //       de este tenant/usuario/centro y es reciente. Sin esta verificación bastaría con
        //       enviar una clave inventada para dar por cumplida la exigencia de foto.
        Evidence evidence = null;
        if (cmd.evidenceKey() != null) {
            EvidenceStoragePort.Outcome outcome = evidenceStorage.validate(
                    tenantId, userId, cmd.workSiteId(), cmd.evidenceKey(), now);
            if (outcome == EvidenceStoragePort.Outcome.VALID) {
                // El bucket lo fija el servidor: el que declare el cliente se descarta.
                evidence = new Evidence(evidenceStorage.bucket(), cmd.evidenceKey(), cmd.evidenceHash());
            } else {
                // Con foto opcional el registro sigue adelante sin evidencia (no se penaliza al
                // colaborador por un fallo de subida); la bandera queda para revisión del supervisor.
                flags.add("EVIDENCE_REJECTED_" + outcome.name());
            }
        }

        // Políticas obligatorias del centro: foto (HU-13 CA1) y biometría (HU-14 CA1).
        if (reason == null && policy.requirePhoto() && evidence == null) {
            reason = RejectionReason.PHOTO_REQUIRED;
        }
        if (reason == null && policy.requireBiometric() && !cmd.biometricVerified()) {
            reason = RejectionReason.BIOMETRIC_REQUIRED;
        }

        // 4) Retardo (RN-16): ENTRADA aceptada tras la tolerancia del turno. No rechaza (RN-15);
        //    marca el registro con el flag LATE + minutos para reporte/incidencia (RETARDO).
        int lateMinutes = 0;
        if (reason == null && eventType == AttendanceEventType.ENTRADA
                && schedule.outcome() == SchedulePolicyPort.Outcome.WITHIN_WINDOW && schedule.minutesLate() > 0) {
            lateMinutes = schedule.minutesLate();
            flags.add("LATE");
        }

        AttendanceStatus status = reason == null ? AttendanceStatus.ACCEPTED : AttendanceStatus.REJECTED;

        // La evidencia verificada se persiste aunque el registro se rechace por otro motivo: es la
        // prueba de un intento real (útil para incidencias) y hace exacta la regla de huérfanos.
        AttendanceRecord record = buildRecord(recordId, tenantId, userId, cmd, now, status, reason,
                qrOk ? qr.nonce() : null, distance, flags, lateMinutes, evidence, source, schedule.shiftId());
        attendance.save(record);

        AttendanceResult result = new AttendanceResult(recordId, status.name(),
                reason == null ? null : reason.name(), now, distance, flags, lateMinutes);
        idempotency.save(tenantId, cmd.operationUuid(), result);

        publishEvent(record, reason, lateMinutes, outOfWindow, now);
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AttendanceSummary> history(UUID tenantId, UUID userId, Instant from, Instant to, int limit) {
        // {@code to} llega como fin de día inclusivo; se convierte a cota exclusiva (+1 día).
        Instant toExclusive = to == null ? null : to.plus(1, ChronoUnit.DAYS);
        return attendance.findRecentByUser(tenantId, userId, from, toExclusive,
                Math.min(Math.max(limit, 1), 200));
    }

    private AttendanceRecord buildRecord(UUID recordId, UUID tenantId, UUID userId, RegisterAttendanceCommand cmd,
                                         Instant now, AttendanceStatus status, RejectionReason reason,
                                         String nonce, Double distance, List<String> flags, int lateMinutes,
                                         Evidence evidence, String source, UUID shiftId) {
        Instant deviceTime = cmd.deviceTimeEpochMs() == null ? null : Instant.ofEpochMilli(cmd.deviceTimeEpochMs());
        Integer skew = deviceTime == null ? null : (int) (now.getEpochSecond() - deviceTime.getEpochSecond());
        GpsFix gps = new GpsFix(cmd.latitude(), cmd.longitude(), cmd.accuracyM());

        return new AttendanceRecord(recordId, tenantId, now, userId, cmd.workSiteId(), shiftId,
                AttendanceEventType.valueOf(cmd.eventType()), status, reason, gps, distance,
                cmd.deviceId(), deviceTime, skew, nonce, cmd.operationUuid(),
                source, cmd.biometricVerified(), evidence,
                buildValidationsJson(flags, reason, distance, lateMinutes));
    }

    private void publishEvent(AttendanceRecord record, RejectionReason reason, int lateMinutes,
                              boolean outOfWindow, Instant now) {
        if (record.isAccepted()) {
            events.publish(AttendanceRegistered.of(record.tenantId(), record.id(), record.userId(),
                    record.workSiteId(), record.eventType().name(), lateMinutes, outOfWindow, now));
        } else {
            events.publish(AttendanceRejected.of(record.tenantId(), record.id(), record.userId(),
                    reason.name(), now));
        }
    }

    /**
     * Hora con la que se evalúa la ventana de turno: la del dispositivo para un fichaje offline
     * reciente y coherente (anterior a la llegada), la del servidor en cualquier otro caso.
     */
    private Instant effectiveTime(RegisterAttendanceCommand cmd, String source, Instant now) {
        if (!"OFFLINE_SYNC".equals(source) || cmd.deviceTimeEpochMs() == null) {
            return now;
        }
        Instant deviceTime = Instant.ofEpochMilli(cmd.deviceTimeEpochMs());
        boolean usable = deviceTime.isBefore(now)
                && !deviceTime.isBefore(now.minus(offlineMaxAgeHours, ChronoUnit.HOURS));
        return usable ? deviceTime : now;
    }

    private String normalizeSource(String source) {
        return "OFFLINE_SYNC".equalsIgnoreCase(source) ? "OFFLINE_SYNC" : "ONLINE";
    }

    private String buildValidationsJson(List<String> flags, RejectionReason reason, Double distance, int lateMinutes) {
        String flagsArray = flags.stream().map(f -> "\"" + f + "\"").collect(Collectors.joining(",", "[", "]"));
        String reasonJson = reason == null ? "null" : "\"" + reason.name() + "\"";
        String distanceJson = distance == null ? "null" : distance.toString();
        return "{\"flags\":" + flagsArray + ",\"rejectionReason\":" + reasonJson
                + ",\"distanceToSiteM\":" + distanceJson + ",\"lateMinutes\":" + lateMinutes + "}";
    }
}
