package com.condor.nexussoft.timeclock.attendance.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * Registro de asistencia (raíz de agregado del núcleo). Su {@code serverTime} es fijado
 * por el servidor (RN-11); el resultado de validación queda inmortalizado en {@code status}
 * + {@code rejectionReason} + {@code validationsJson}.
 */
public class AttendanceRecord {

    private final UUID id;
    private final UUID tenantId;
    private final Instant serverTime;
    private final UUID userId;
    private final UUID workSiteId;
    /** Turno al que se atribuye la marca (RN-15); nulo si ninguno la reclama. */
    private final UUID shiftId;
    private final AttendanceEventType eventType;
    private final AttendanceStatus status;
    private final RejectionReason rejectionReason;
    private final GpsFix gps;
    private final Double distanceToSiteM;
    private final String deviceId;
    private final Instant deviceTime;
    private final Integer timeSkewSeconds;
    private final String qrNonce;
    private final UUID operationUuid;
    private final String source;
    private final boolean biometricVerified;
    private final Evidence evidence;
    private final String validationsJson;

    public AttendanceRecord(UUID id, UUID tenantId, Instant serverTime, UUID userId, UUID workSiteId, UUID shiftId,
                            AttendanceEventType eventType, AttendanceStatus status, RejectionReason rejectionReason,
                            GpsFix gps, Double distanceToSiteM, String deviceId, Instant deviceTime,
                            Integer timeSkewSeconds, String qrNonce, UUID operationUuid, String source,
                            boolean biometricVerified, Evidence evidence, String validationsJson) {
        this.id = id;
        this.tenantId = tenantId;
        this.serverTime = serverTime;
        this.userId = userId;
        this.workSiteId = workSiteId;
        this.shiftId = shiftId;
        this.eventType = eventType;
        this.status = status;
        this.rejectionReason = rejectionReason;
        this.gps = gps;
        this.distanceToSiteM = distanceToSiteM;
        this.deviceId = deviceId;
        this.deviceTime = deviceTime;
        this.timeSkewSeconds = timeSkewSeconds;
        this.qrNonce = qrNonce;
        this.operationUuid = operationUuid;
        this.source = source;
        this.biometricVerified = biometricVerified;
        this.evidence = evidence;
        this.validationsJson = validationsJson;
    }

    public boolean isAccepted() {
        return status == AttendanceStatus.ACCEPTED;
    }

    public UUID id() { return id; }
    public UUID tenantId() { return tenantId; }
    public Instant serverTime() { return serverTime; }
    public UUID userId() { return userId; }
    public UUID workSiteId() { return workSiteId; }
    public UUID shiftId() { return shiftId; }
    public AttendanceEventType eventType() { return eventType; }
    public AttendanceStatus status() { return status; }
    public RejectionReason rejectionReason() { return rejectionReason; }
    public GpsFix gps() { return gps; }
    public Double distanceToSiteM() { return distanceToSiteM; }
    public String deviceId() { return deviceId; }
    public Instant deviceTime() { return deviceTime; }
    public Integer timeSkewSeconds() { return timeSkewSeconds; }
    public String qrNonce() { return qrNonce; }
    public UUID operationUuid() { return operationUuid; }
    public String source() { return source; }
    public boolean biometricVerified() { return biometricVerified; }
    public Evidence evidence() { return evidence; }
    public String validationsJson() { return validationsJson; }
}
